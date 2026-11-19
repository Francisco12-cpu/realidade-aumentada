# Converte um modelo de zumbi (FBX, GLB/GLTF ou BLEND, com esqueleto e
# animações) para o formato do jogo: models/zumbi.glb, leve para o celular.
#  - reduz a malha até ~ALVO triângulos (são dezenas de zumbis na tela)
#  - texturas até 1024 px (WEBP)
#  - exporta TODAS as animações (o jogo acha andar/correr/atacar/morrer pelo nome)
#
# Uso (Blender sem janela):
#   blender -b --python tools/zumbi-modelo.py -- ENTRADA.fbx models/zumbi.glb [ALVO=7000]
# Animações em arquivos separados (Mixamo: um FBX por animação) também servem:
#   blender -b --python tools/zumbi-modelo.py -- modelo.fbx models/zumbi.glb 7000 andar.fbx correr.fbx atacar.fbx morrer.fbx
import bpy, sys, os

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
alvo = int(argv[2]) if len(argv) > 2 else 7000
extras = argv[3:]

bpy.ops.wm.read_factory_settings(use_empty=True)

def importar(path):
    ext = os.path.splitext(path)[1].lower()
    antes = set(bpy.data.objects)
    if ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=True)
    elif ext in ('.glb', '.gltf'):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == '.blend':
        with bpy.data.libraries.load(path) as (data_from, data_to):
            data_to.objects = data_from.objects
            data_to.actions = data_from.actions
        for o in data_to.objects:
            if o is not None:
                bpy.context.scene.collection.objects.link(o)
    else:
        raise SystemExit(f'formato não suportado: {ext}')
    return [o for o in bpy.data.objects if o not in antes]

novos = importar(src)
arm = next((o for o in novos if o.type == 'ARMATURE'), None)
malhas = [o for o in novos if o.type == 'MESH']
print('esqueleto:', arm.name if arm else None, '| malhas:', len(malhas))

# animações de arquivos extras (ex.: Mixamo): copia as ações para o esqueleto principal
for path in extras:
    novos2 = importar(path)
    a2 = next((o for o in novos2 if o.type == 'ARMATURE'), None)
    if a2 and a2.animation_data and a2.animation_data.action:
        act = a2.animation_data.action
        act.name = os.path.splitext(os.path.basename(path))[0]
        act.use_fake_user = True
    for o in novos2:
        bpy.data.objects.remove(o, do_unlink=True)

# cada ação vira uma faixa NLA (o exportador manda todas)
if arm:
    arm.animation_data_create()
    for act in bpy.data.actions:
        tr = arm.animation_data.nla_tracks.new(); tr.name = act.name
        try:
            tr.strips.new(act.name, int(act.frame_range[0]), act)
        except Exception as e:
            print('ação ignorada', act.name, e)
    arm.animation_data.action = None

def ntri(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)

total = sum(ntri(o) for o in malhas)
print('triângulos antes:', total)
if total > alvo:
    k = alvo / total
    for o in malhas:
        bpy.context.view_layer.objects.active = o
        m = o.modifiers.new('menos', 'DECIMATE'); m.ratio = max(0.05, k)
        # o modificador fica ANTES do esqueleto (reduz a malha de repouso)
        while o.modifiers.find('menos') > 0:
            bpy.ops.object.modifier_move_up(modifier='menos')
        bpy.ops.object.modifier_apply(modifier='menos')
print('triângulos depois:', sum(ntri(o) for o in malhas))

for img in bpy.data.images:
    w, h = img.size
    if max(w, h) > 1024:
        f = 1024 / max(w, h); img.scale(max(1, int(w * f)), max(1, int(h * f)))

os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animation_mode='NLA_TRACKS',
                          export_image_format='WEBP', export_image_quality=80, export_yup=True)
print('ok', out, [a.name for a in bpy.data.actions])
