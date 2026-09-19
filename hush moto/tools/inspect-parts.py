import bpy,sys,json
from mathutils import Vector
bpy.context.preferences.filepaths.use_scripts_auto_execute=False
if sys.argv[1].endswith('.blend'): bpy.ops.wm.open_mainfile(filepath=sys.argv[1],use_scripts=False)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=sys.argv[1])
bpy.context.view_layer.update()
for obj in list(bpy.context.scene.objects):
    if obj.type!='MESH': continue
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=.00001);bpy.ops.mesh.separate(type='LOOSE');bpy.ops.object.mode_set(mode='OBJECT')
bpy.context.view_layer.update()
for obj in bpy.context.scene.objects:
    if obj.type!='MESH': continue
    pts=[obj.matrix_world@v.co for v in obj.data.vertices]
    lo=[round(min(p[i] for p in pts),4) for i in range(3)];hi=[round(max(p[i] for p in pts),4) for i in range(3)]
    print(json.dumps(dict(name=obj.name,n=len(pts),lo=lo,hi=hi,mat=[m.name for m in obj.data.materials if m])))
