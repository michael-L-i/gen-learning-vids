"""Generic trusted-local Blender frame host. No lesson/subject geometry lives here."""
import argparse
import importlib.util
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
sys.dont_write_bytecode = True
import bpy


def atomic_json(file, value):
    temp=file.with_suffix('.tmp')
    temp.write_text(json.dumps(value,indent=2));temp.replace(file)


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--module',required=True);p.add_argument('--timeline',required=True);p.add_argument('--output',required=True)
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:])
    source=Path(args.module).resolve();out=Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
    sys.path.insert(0,str(source.parent))
    spec=importlib.util.spec_from_file_location('lesson_scene',source)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    timeline=json.loads(Path(args.timeline).read_text());reports=[]
    for index,chapter in enumerate(timeline):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        ctx={**chapter,'fps':30,'width':1280,'height':720,'source_dir':str(source.parent)}
        result=mod.build_scene(index,ctx)
        update=result['update'] if isinstance(result,dict) else result
        frame_key=result.get('frame_key') if isinstance(result,dict) else None
        if not callable(update):raise ValueError('build_scene must return update(seconds), or a dict containing update and optional frame_key')
        scene=bpy.context.scene
        if not scene.camera:raise ValueError('The authored scene must provide a camera')
        scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100;scene.render.fps=30
        scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB';scene.render.image_settings.compression=15
        frame_count=round(chapter['duration']*30);folder=out/f'frames-{index}';folder.mkdir(exist_ok=True)
        cache={};ordered=[];rendered=0;reused=0;began=time.monotonic()
        samples={min(frame_count-1,round(frame_count*q)):q for q in [.05,.25,.5,.75,.95]}
        for frame in range(frame_count):
            t=frame/30
            key=json.dumps(frame_key(t),sort_keys=True,allow_nan=False) if frame_key else str(frame)
            target=cache.get(key)
            if target is None:
                scene.frame_set(frame+1);update(t)
                target=folder/f'{rendered:06d}.png';scene.render.filepath=str(target)
                # Blender's native renderer is verbose; retain diagnostics on disk
                # instead of overflowing the Node process-output buffer.
                sys.stdout.flush()
                original=os.dup(1)
                try:
                    with open(out/f'blender-{index}.log','ab') as render_log:
                        os.dup2(render_log.fileno(),1)
                        bpy.ops.render.render(write_still=True)
                finally:
                    os.dup2(original,1);os.close(original)
                if not target.is_file():raise ValueError('Blender did not produce the expected frame')
                cache[key]=target;rendered+=1
            else:reused+=1
            ordered.append(target)
            if frame in samples:shutil.copyfile(target,out/f'scene-{index}-{samples[frame]}.png')
            if frame%30==0 or frame==frame_count-1:atomic_json(out/'progress.json',{'scene':index,'frame':frame+1,'frames':frame_count,'rendered':rendered,'reused':reused})
        # Image2pipe supplies exactly one encoded image per output frame, including
        # reused frames. Timing does not depend on filesystem timestamps.
        cmd=['ffmpeg','-y','-v','error','-f','image2pipe','-framerate','30','-vcodec','png','-i','-','-c:v','libx264','-crf','18','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',str(out/f'visual-{index}.mp4')]
        with open(out/f'encode-{index}.log','wb') as err:
            proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=err)
            try:
                for file in ordered:proc.stdin.write(file.read_bytes())
                proc.stdin.close()
                if proc.wait()!=0:raise RuntimeError('FFmpeg encoding failed; see encode log')
            except BaseException:
                proc.kill();proc.wait();raise
        reports.append({'scene':index,'frames':frame_count,'rendered':rendered,'reused':reused,'seconds':time.monotonic()-began,'engine':scene.render.engine})
        atomic_json(out/'render-report.json',{'backend':'blender','version':bpy.app.version_string,'scenes':reports,'limitations':['Authored frame_key must uniquely identify identical visual states.','No automatic 3D label collision or scientific correctness checks.']})
        shutil.rmtree(folder)
        print(f'Finished Blender chapter {index+1}: {rendered} rendered, {reused} reused',flush=True)

if __name__=='__main__':main()
