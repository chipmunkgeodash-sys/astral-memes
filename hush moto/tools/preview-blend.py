import bpy, sys, math
from mathutils import Vector
bpy.context.preferences.filepaths.use_scripts_auto_execute = False
if sys.argv[1].endswith('.blend'): bpy.ops.wm.open_mainfile(filepath=sys.argv[1], use_scripts=False)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=sys.argv[1])
scene=bpy.context.scene
for ob in list(scene.objects):
    if ob.type in {'CAMERA', 'LIGHT'}: bpy.data.objects.remove(ob, do_unlink=True)
for mat in bpy.data.materials:
    mat.use_nodes=True
    bs=mat.node_tree.nodes.get('Principled BSDF')
    if bs:
        for socket in ['Base Color','Alpha','Normal']:
            for link in list(bs.inputs[socket].links): mat.node_tree.links.remove(link)
        bs.inputs['Alpha'].default_value=1
bpy.ops.object.camera_add(location=(6,0,.4))
camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,.4))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=5 if sys.argv[1].endswith('.blend') else 2.6;scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=8
scene.world=scene.world or bpy.data.worlds.new('Preview World')
scene.world.color=(.6,.6,.6)
bpy.ops.object.light_add(type='AREA',location=(4,-3,6));bpy.context.object.data.energy=1200;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=5
scene.render.resolution_x=1000;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.render.filepath=sys.argv[2];bpy.ops.render.render(write_still=True)
