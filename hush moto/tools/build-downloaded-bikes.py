"""Convert the user's existing Stark BLEND and KTM GLB; Blender 4.3 / bpy."""
import bpy, math, pathlib
from mathutils import Matrix, Vector
ROOT=pathlib.Path(__file__).resolve().parent.parent
bpy.context.preferences.filepaths.use_scripts_auto_execute=False
def empty(name, p, parent=None):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o)
    o.parent=parent;o.location=Vector(p) if not parent else Vector(p)-parent.matrix_world.translation
    bpy.context.view_layer.update();return o
def rig(front,rear,head,pivot,bar,peg):
    # Work in Blender X right, Y rear, Z up; exporter converts to game Y up.
    root=empty('Bike',(0,0,0));steer=empty('Steering',head,root)
    fork=empty('FrontSuspension',head,steer);f=empty('FrontWheel',front,fork)
    swing=empty('RearSwing',pivot,root);r=empty('RearWheel',rear,swing)
    for name,p in [('GripLeft',(-bar,head[1]+.10,head[2]+.12)),('GripRight',(bar,head[1]+.10,head[2]+.12))]: empty(name,p,steer)
    for name,x in [('PegLeft',-.21),('PegRight',.21)]: empty(name,(x,peg,.34),root)
    return root,steer,fork,f,swing,r
def bake(obj,matrix,parent):
    obj.data.transform(matrix@obj.matrix_world);obj.parent=parent
    obj.matrix_world=Matrix.Identity(4)
    # Geometry currently in world space; preserve it relative to new pivot.
    obj.data.transform(parent.matrix_world.inverted());obj.matrix_parent_inverse=Matrix.Identity(4)
    obj.matrix_basis=Matrix.Identity(4)
def export(file):
    pathlib.Path(file).parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',export_cameras=False,export_lights=False,export_extras=True)
def stark():
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'tools/asset-work/stark/source/Stark Varg.blend'),use_scripts=False)
    bpy.context.view_layer.update()
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    # Axle sockets in the supplied unfinished model, scaled to 1480 mm.
    scale=1.48/(1.52+1.37)
    transform=Matrix.Translation((0,.70-1.52*scale,.340+.61*scale))@Matrix.Diagonal((scale,scale,scale,1))
    root,steer,fork,f,swing,r=rig((0,-.78,.347),(0,.70,.340),(0,-.39,.97),(0,.08,.48),.405,0)
    for name,x in [('GripLeft',-.37),('GripRight',.37)]: bpy.data.objects[name].location=Vector((x,-.345,1.24))-steer.matrix_world.translation
    for name in ['PegLeft','PegRight']: bpy.data.objects[name].location.z=.415
    for ob in meshes:
        bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
        bpy.ops.object.convert(target='MESH')
        parent=steer if ob.name=='Cylinder.002' else fork if ob.name=='Cube.002' else swing if ob.name=='Swing arm' else root
        bake(ob,transform,parent)
        if ob.name=='Cylinder.002':
            for v in ob.data.vertices: v.co.x*=1.40
    keep=set(meshes+[root,steer,fork,f,swing,r]+list(steer.children)+list(root.children))
    # Drop reference images, lights and the source import hierarchy only after baking.
    for ob in list(bpy.context.scene.objects):
        if ob not in keep and ob.type!='MESH': bpy.data.objects.remove(ob,do_unlink=True)
    for mat in bpy.data.materials:
        mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF')
        if not bs: continue
        for socket in ['Base Color','Alpha','Normal']:
            for link in list(bs.inputs[socket].links): mat.node_tree.links.remove(link)
        bs.inputs['Alpha'].default_value=1
        if mat.name=='Material.018': bs.inputs['Base Color'].default_value=(.68,.018,.012,1)
        if mat.name=='Material.013': bs.inputs['Base Color'].default_value=(.018,.02,.023,1)
        if mat.name=='Material.020': bs.inputs['Base Color'].default_value=(.11,.12,.13,1)
        if mat.name=='Material.023': bs.inputs['Base Color'].default_value=(.045,.052,.06,1)
        bs.inputs['Roughness'].default_value=.55
    root['useExistingWheels']=True
    export(ROOT/'assets/bikes/stark/stark.glb')
def ktm():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'tools/asset-work/ktm/source/unpacked/ktm_1290_super_duke_low_poly_and_stylized.glb'))
    bpy.context.view_layer.update()
    for ob in list(bpy.context.scene.objects):
        if ob.type!='MESH': continue
        if ob.data.materials[0].name=='Outline': bpy.data.objects.remove(ob,do_unlink=True);continue
        bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=.00001);bpy.ops.mesh.separate(type='LOOSE');bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.update()
    parts=[o for o in bpy.context.scene.objects if o.type=='MESH']
    unlean=Matrix.Rotation(-math.radians(12),4,'Y')
    scale=1.497/(.73795+.7423)
    # The author posed the bike on its stand, including turned front assembly.
    transform=Matrix.Translation((.001, .755-.73795*scale,.015))@Matrix.Diagonal((scale,scale,scale,1))@unlean
    root,steer,fork,f,swing,r=rig((0,-.742,.300),(0,.755,.326),(0,-.405,.88),(0,.075,.43),.34,.14)
    for name,x in [('GripLeft',-.34),('GripRight',.34)]: bpy.data.objects[name].location=Vector((x,-.32,1.055))-steer.matrix_world.translation
    for ob in parts:
        idx=int(ob.name.rsplit('.',1)[1]) if '.' in ob.name else 0
        parent=f if 117<=idx<=129 else r if idx>=130 else fork if idx in list(range(76,87))+list(range(106,112)) else steer if 70<=idx<=116 or idx==7 else swing if idx in [4,38] else root
        bake(ob,transform,parent)
    # Normalize tyre assemblies precisely to the configured radii and axle centres.
    for pivot, radius in [(f,.300),(r,.326)]:
        # Bounds are in local pivot space until the dependency graph refreshes.
        pts=[v.co for ob in pivot.children for v in ob.data.vertices]
        lo=Vector(tuple(min(v[i] for v in pts) for i in range(3)));hi=Vector(tuple(max(v[i] for v in pts) for i in range(3)))
        center=(lo+hi)/2;rad=max(hi.y-lo.y,hi.z-lo.z)/2
        adjust=Matrix.Diagonal((1,radius/rad,radius/rad,1))@Matrix.Translation(-center)
        for ob in pivot.children: ob.data.transform(adjust)
    keep={root,steer,fork,f,swing,r,*parts,*steer.children,*root.children}
    for ob in list(bpy.context.scene.objects):
        if ob not in keep: bpy.data.objects.remove(ob,do_unlink=True)
    for mat in bpy.data.materials:
        if mat.name!='Toon_SuperDuke':continue
        bs=mat.node_tree.nodes.get('Principled BSDF')
        # Move the supplied colour atlas from unlit emission to a lit PBR surface.
        tex=next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE')
        mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
        for link in list(bs.inputs['Emission Color'].links): mat.node_tree.links.remove(link)
        bs.inputs['Emission Color'].default_value=(0,0,0,1);bs.inputs['Metallic'].default_value=.15;bs.inputs['Roughness'].default_value=.58
    export(ROOT/'assets/bikes/ktm/duke.glb')
stark();ktm()
