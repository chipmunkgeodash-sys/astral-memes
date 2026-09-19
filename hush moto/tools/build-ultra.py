"""Adapt the user-supplied Files3D Ultra Bee STL for local gameplay with bpy."""
import bpy, pathlib, math, numpy as np
from mathutils import Vector, Matrix
ROOT=pathlib.Path(__file__).resolve().parent.parent
bpy.ops.wm.read_factory_settings(use_empty=True)
path=ROOT/'tools/asset-work/ultra/obj_1_Untitled.stl'
with open(path,'rb') as f:
    f.read(84);data=np.frombuffer(f.read(),dtype=np.dtype([('normal','<f4',3),('v','<f4',(3,3)),('attr','<u2')]))
tri=data['v'].astype(np.float64);centers=tri.mean(axis=1)
x,y,z=centers.T;x=x-128
rf=np.hypot(y-94.3,z-16.2);rr=np.hypot(y-162.0,z-16.8)
fork_line=94.3+(z-16.2)*.46
fork_tube=(np.abs(y-fork_line)<2.6)&(z>16)&(np.abs(x)>3.1)
swing_tube=(np.abs(z-(16.8+(162-y)*.21))<2.0)&(y<162)&(np.abs(x)>3.4)
front=(rf<17.8)&(~fork_tube)
rear=(rr<17.8)&(~swing_tube)
# Preserve original mesh triangles, dividing only at mechanical assemblies.
steering=(z>54)|((y<111.5+(z-45)*.35)&(z>31))|fork_tube
swing=(y>138)&(z<28)&(~rear)
parts=np.zeros(len(tri),dtype=np.int8)
parts[steering]=1;parts[steering&(z<34)]=2;parts[swing]=4
parts[front]=3;parts[rear]=5

def empty(name,p,parent=None):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=parent
    o.location=Vector(p)-(parent.matrix_world.translation if parent else Vector())
    bpy.context.view_layer.update();return o
root=empty('UltraBee',(0,0,0));steer=empty('Steering',(0,-.36,1.02),root)
fork=empty('FrontSuspension',(0,-.36,1.02),steer)
f=empty('FrontWheel',(0,-.745,.3213),fork)
s=empty('RearSwing',(0,.07,.46),root);r=empty('RearWheel',(0,.635,.3223),s)
for name,side in [('GripLeft',-1),('GripRight',1)]:empty(name,(side*.355,-.218,1.203),steer)
for name,side in [('PegLeft',-1),('PegRight',1)]:empty(name,(side*.18,.055,.37),root)
pivots=[root,steer,fork,f,s,r]

def mat(name,color,metal=0,rough=.6):
    m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value=(*color,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough;return m
materials=[mat('Graphite battery and motor',(.028,.033,.036),.35),mat('Graphite plastics',(.042,.048,.043)),
 mat('Seat and grips',(.014,.018,.020),0,.92),mat('Silver alloy',(.34,.39,.40),.75,.35),
 mat('Dark trim',(.025,.035,.019)),mat('Knobby tyre',(.011,.013,.015),0,.96),
 mat('Rims',(.038,.045,.05),.65,.4),mat('Fork stanchions',(.52,.37,.13),.8,.3)]
colors=np.zeros(len(tri),dtype=np.int8)
colors[(z>38)&(z<49)&(y>111)&(y<145)&(np.abs(x)>2.2)]=1
colors[(z>44)&(y>113)&(y<155)]=2
colors[(z>42)&(y>149)]=1
colors[(z>36)&(z<43)&(y>114)&(y<127)&(np.abs(x)>5)]=4
colors[(z>27)&(z<40)&(y>115)&(y<147)&(np.abs(x)>4.4)]=3
colors[(parts==1)|(parts==2)]=3
colors[(parts==1)&(z>54)]=0
colors[(parts==1)&(z>57)&(np.abs(x)>14)]=2
colors[(parts==1)&(z>40)&(z<48)&(y<111)]=1
colors[(parts==1)&(z>34)&(z<53)&(np.abs(y-fork_line)<2.4)]=7
colors[parts==4]=3
colors[(parts==0)&(colors==3)]=0
for mask,rad in [(front,rf),(rear,rr)]:
    colors[mask]=3;colors[mask&(rad>12)]=6;colors[mask&(rad>13.8)]=5

converted=tri.copy()
converted[:,:,0]=(tri[:,:,0]-128)*(.80/49.24149)
converted[:,:,1]=(tri[:,:,1]-162.0)*(1.38/(162.0-94.3))+.635
converted[:,:,2]=(tri[:,:,2]-16.8)*.02+.3223
for part,parent in enumerate(pivots):
    # A fused display wheel cannot rotate cleanly: fork/swingarm cut-outs
    # leave holes in the tyre and spokes. Runtime supplies circular wheels.
    if part in (3,5):continue
    for color,material in enumerate(materials):
        mask=(parts==part)&(colors==color)
        if not np.any(mask):continue
        verts=converted[mask].reshape(-1,3)
        verts=verts-np.array(parent.matrix_world.translation)
        mesh=bpy.data.meshes.new(f'{parent.name}_{material.name}');mesh.from_pydata(verts.tolist(),[],np.arange(len(verts)).reshape(-1,3).tolist());mesh.update()
        ob=bpy.data.objects.new(mesh.name,mesh);bpy.context.collection.objects.link(ob);ob.parent=parent;mesh.materials.append(material)
        bpy.context.view_layer.objects.active=ob;ob.select_set(True)
        # Weld the STL's duplicated vertices before calculating smooth normals.
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=.00002);bpy.ops.object.mode_set(mode='OBJECT')
        for face in mesh.polygons:face.use_smooth=True
        ob.select_set(False)
    print(parent.name,int(np.sum(parts==part)),'triangles')
root['author']='Files3D.3mf';root['source']='https://makerworld.com/en/models/3176299-surron-ultra-bee'
root['adaptation']='User-supplied display STL: separated moving assemblies, rescaled, recolored and rigged for local gameplay; not OEM CAD.'
root['license']='Standard Digital File License; local use only, no redistribution.'
out=ROOT/'assets/bikes/files3d';out.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out/'ultra.glb'),export_format='GLB',export_cameras=False,export_lights=False,export_extras=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'tools/asset-work/ultra/rigged.blend'))
