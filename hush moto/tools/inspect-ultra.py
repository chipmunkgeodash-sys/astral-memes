import bpy,math
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.stl_import(filepath=r'C:\Users\matt\Downloads\hush moto\tools\asset-work\ultra\obj_1_Untitled.stl')
ob=bpy.context.object
ob.location-=Vector((128,128,0));ob.scale=(.02,.02,.02)
# Apply translation before scale around the source origin.
for v in ob.data.vertices:v.co=(v.co-Vector((128,128,0)))*.02
ob.location=(0,0,0);ob.scale=(1,1,1)
for p in ob.data.polygons:p.use_smooth=True
mat=bpy.data.materials.new('Clay');mat.diffuse_color=(.42,.47,.52,1);ob.data.materials.append(mat)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12
scene.world=bpy.data.worlds.new('World');scene.world.color=(.5,.5,.5)
bpy.ops.object.camera_add(location=(5,0,.65));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.65))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.3;scene.camera=cam
bpy.ops.object.light_add(type='AREA',location=(3,-2,5));bpy.context.object.data.energy=800;bpy.context.object.data.size=5
scene.render.resolution_x=1200;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.render.filepath=r'C:\Users\matt\Downloads\hush moto\tools\asset-work\ultra\side.png';bpy.ops.render.render(write_still=True)
