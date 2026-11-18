# Uso: blender -b --python tools/escola-blocos.py -- original.glb models/escola.glb 24
# Blender (v15): escola em BLOCOS para o celular só desenhar o que está na frente.
#  - igual à v12: objetos pequenos (< 6 m) e detalhados (> 400 tri) ficam com 30%
#  - cada objeto vira "estrutura" (s, >= 6 m: parede, chão, telhado) ou "detalhe"
#    (d, < 6 m: carro, pessoa, planta, móvel). O jogo esconde detalhes longe.
#  - bloco de CELL m: objeto pequeno vai inteiro para o bloco do seu centro;
#    objeto grande é repartido face a face (sem cortar nada: a colisão fica igual)
#  - em cada bloco, junta por material. Texturas até 1024 px WEBP.
import bpy, bmesh, sys, math
argv = sys.argv[sys.argv.index('--') + 1:]
src, out, CELL = argv[0], argv[1], float(argv[2])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
def ntri(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
print('ANTES tris', sum(ntri(o) for o in meshes), 'objetos', len(meshes))
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.make_single_user(object=True, obdata=True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.select_all(action='DESELECT')
cid = lambda x, y: int(math.floor(x / CELL)) * 1000 + int(math.floor(y / CELL)) + 500500
nd = 0
for o in meshes:
    vs = [v.co for v in o.data.vertices]
    if not vs: continue
    size = max(max(v[i] for v in vs) - min(v[i] for v in vs) for i in range(3))
    if ntri(o) > 400 and size < 6:
        bpy.context.view_layer.objects.active = o
        m = o.modifiers.new('menos', 'DECIMATE'); m.ratio = 0.3
        bpy.ops.object.modifier_apply(modifier=m.name)
    det = size < 6
    nd += det
    cx = sum(v[0] for v in vs) / len(vs); cy = sum(v[1] for v in vs) / len(vs)
    att = o.data.attributes.new('ck', 'INT', 'FACE')
    for p in o.data.polygons:
        if size < CELL: c = cid(cx, cy)
        else: c = cid(p.center[0], p.center[1])
        att.data[p.index].value = c * 2 + (1 if det else 0)
print('detalhes', nd)
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.join()
big = bpy.context.view_layer.objects.active
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0005)
bpy.ops.object.mode_set(mode='OBJECT')
keys = sorted(set(a.value for a in big.data.attributes['ck'].data))
print('blocos', len(keys))
parts = []
for k in keys[:-1]:
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(big.data)
    lay = bm.faces.layers.int.get('ck')
    for f in bm.faces: f.select = (f[lay] == k)
    for e in bm.edges: e.select = False
    for v in bm.verts: v.select = False
    for f in bm.faces:
        if f.select:
            for v in f.verts: v.select = True
    bm.select_flush(True)
    bmesh.update_edit_mesh(big.data)
    if not any(f.select for f in bm.faces):
        bpy.ops.object.mode_set(mode='OBJECT'); continue
    before = set(bpy.context.scene.objects)
    bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    new = [o for o in bpy.context.scene.objects if o not in before]
    for o in new: parts.append((o, k))
parts.append((big, keys[-1]))
# cada bloco: separa por material e dá nome  s_<bloco>_<mat> / d_<bloco>_<mat>
final = []
for o, k in parts:
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active = o
    before = set(bpy.context.scene.objects)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='MATERIAL'); bpy.ops.object.mode_set(mode='OBJECT')
    grp = [o] + [x for x in bpy.context.scene.objects if x not in before]
    for x in grp:
        if not x.data.polygons: continue
        pre = 'd' if k % 2 else 's'
        x.name = f"{pre}_{k // 2}_{x.active_material.name if x.active_material else 'sem'}"
        if 'ck' in x.data.attributes: x.data.attributes.remove(x.data.attributes['ck'])
        final.append(x)
print('DEPOIS tris', sum(ntri(o) for o in final), 'pecas', len(final),
      'estrutura', sum(1 for o in final if o.name.startswith('s_')), 'detalhe', sum(1 for o in final if o.name.startswith('d_')))
for img in bpy.data.images:
    w, h = img.size
    if max(w, h) > 1024:
        k = 1024 / max(w, h); img.scale(max(1, int(w * k)), max(1, int(h * k)))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='WEBP', export_image_quality=80, export_apply=True, export_yup=True)
print('ok')
