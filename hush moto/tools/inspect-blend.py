import bpy, sys, json
from mathutils import Vector
bpy.context.preferences.filepaths.use_scripts_auto_execute = False
bpy.ops.wm.open_mainfile(filepath=sys.argv[1], use_scripts=False)
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH': continue
    points = [obj.matrix_world @ Vector(v) for v in obj.bound_box]
    print(json.dumps(dict(name=obj.name, vertices=len(obj.data.vertices),
        minimum=[min(v[i] for v in points) for i in range(3)],
        maximum=[max(v[i] for v in points) for i in range(3)],
        materials=[m.name for m in obj.data.materials if m])))
print('IMAGES', [(im.name, im.filepath, bool(im.packed_file)) for im in bpy.data.images])
