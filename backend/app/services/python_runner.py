import json
import math
import os
from pathlib import Path
import selectors
import signal
import subprocess
import sys
import tempfile
import time


def run(cells, settings):
    started = time.monotonic()
    streams = {'stdout': bytearray(), 'stderr': bytearray()}
    error = None
    with tempfile.TemporaryDirectory(dir=settings.home / 'sessions') as directory:
        env = {'PATH': '/usr/bin:/bin', 'HOME': directory, 'TMPDIR': directory,
               'OPENBLAS_NUM_THREADS': '1', 'OMP_NUM_THREADS': '1', 'PYTHONIOENCODING': 'utf-8'}
        process = subprocess.Popen([sys.executable, '-I', '-u', str(Path(__file__).with_name('worker.py'))],
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   cwd=directory, env=env, start_new_session=True)
        try:
            process.stdin.write(json.dumps({'cells': cells, 'datasets': str(settings.home / 'uploads'), 'cpu': math.ceil(settings.python_timeout)}).encode())
            process.stdin.close()
            with selectors.DefaultSelector() as selector:
                for name in streams:
                    pipe = getattr(process, name)
                    os.set_blocking(pipe.fileno(), False)
                    selector.register(pipe, selectors.EVENT_READ, name)
                while selector.get_map():
                    if time.monotonic() - started > settings.python_timeout:
                        error = 'Execution timed out'
                        break
                    for key, _ in selector.select(timeout=0.05):
                        data = os.read(key.fileobj.fileno(), 8192)
                        if not data:
                            selector.unregister(key.fileobj)
                        else:
                            remaining = settings.output_limit - sum(map(len, streams.values()))
                            streams[key.data].extend(data[:max(remaining, 0)])
                            if len(data) > remaining:
                                error = 'Output limit exceeded'
                                break
                    if error:
                        break
            if not error:
                try:
                    process.wait(timeout=max(0.01, settings.python_timeout - (time.monotonic() - started)))
                except subprocess.TimeoutExpired:
                    error = 'Execution timed out'
        finally:
            # Also clean up descendants which inherited pipes or outlived the parent.
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()
            process.stdout.close()
            process.stderr.close()
    result = {name: value.decode('utf-8', errors='replace') for name, value in streams.items()}
    if process.returncode and not error:
        error = result['stderr'][-4000:] or f'Python exited with code {process.returncode}'
    return {**result, 'error': error, 'exit_code': process.returncode}
