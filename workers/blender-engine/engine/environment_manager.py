from __future__ import annotations

from .assets import AssetLibrary
from .blender_env import bpy
from .contracts import Scene, ShotProp


class EnvironmentManager:
    def __init__(self, library: AssetLibrary, manifest: dict[str, str]) -> None:
        self.library = library
        self.manifest = manifest
        self.props: dict[str, str] = {}

    def load_environment(self, scene: Scene):
        modules = bpy()
        path = self.library.resolve(scene.environment_id, self.manifest)
        before = set(modules.data.objects.keys())
        worlds_before = set(modules.data.worlds.keys())

        with modules.data.libraries.load(str(path), link=False) as (source, target):
            target.objects = list(source.objects)
            # The world carries the sky and the ambient light; without it every
            # scene renders against black no matter how the environment was authored.
            target.worlds = list(source.worlds)

        collection = modules.data.collections.new(f"environment_{scene.environment_id}")
        modules.context.scene.collection.children.link(collection)

        for name in set(modules.data.objects.keys()) - before:
            collection.objects.link(modules.data.objects[name])

        imported_worlds = sorted(set(modules.data.worlds.keys()) - worlds_before)
        if imported_worlds:
            modules.context.scene.world = modules.data.worlds[imported_worlds[0]]

        return collection

    def load_prop(self, prop: ShotProp, frame: int):
        modules = bpy()
        if prop.prop_id in self.props:
            obj = modules.data.objects.get(self.props[prop.prop_id])
        else:
            path = self.library.resolve(prop.prop_id, self.manifest)
            before = set(modules.data.objects.keys())
            with modules.data.libraries.load(str(path), link=False) as (source, target):
                target.objects = list(source.objects)
            new_names = set(modules.data.objects.keys()) - before
            if not new_names:
                raise FileNotFoundError(f"{path} contained no object for {prop.prop_id}")
            obj = modules.data.objects[sorted(new_names)[0]]
            obj.name = f"prop_{prop.prop_id}"
            modules.context.collection.objects.link(obj)
            self.props[prop.prop_id] = obj.name

        if obj is None:
            raise FileNotFoundError(f"prop {prop.prop_id} could not be loaded")

        if prop.position:
            obj.location = prop.position.as_tuple()
            obj.keyframe_insert(data_path="location", frame=frame)
        return obj

    def build_parallax(self, scene: Scene) -> list[str]:
        modules = bpy()
        planes: list[str] = []

        for index, layer in enumerate(sorted(scene.background_layers, key=lambda item: -item.depth)):
            image_path = self.manifest.get(layer.asset_key, layer.asset_key)
            image = modules.data.images.load(image_path, check_existing=True)

            modules.ops.mesh.primitive_plane_add(size=2.0)
            plane = modules.context.active_object
            plane.name = f"layer_{index}_{layer.depth:.2f}"

            aspect = image.size[0] / max(1, image.size[1])
            distance = 4.0 + layer.depth * 40.0
            plane.scale = (distance * aspect * 0.5, 1.0, distance * 0.5)
            plane.rotation_euler = (1.5707963, 0.0, 0.0)
            plane.location = (0.0, distance, 0.0)

            material = modules.data.materials.new(name=f"mat_{plane.name}")
            material.use_nodes = True
            material.blend_method = "BLEND"
            nodes = material.node_tree.nodes
            links = material.node_tree.links
            texture = nodes.new("ShaderNodeTexImage")
            texture.image = image
            emission = nodes.new("ShaderNodeEmission")
            output = next(node for node in nodes if node.type == "OUTPUT_MATERIAL")
            links.new(texture.outputs["Color"], emission.inputs["Color"])
            links.new(emission.outputs["Emission"], output.inputs["Surface"])
            plane.data.materials.append(material)

            planes.append(plane.name)

        return planes
