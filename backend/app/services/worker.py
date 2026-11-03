"""Child-process entry point. Resource limits are guardrails, NOT a sandbox."""
import json
import sys
import traceback

payload = json.load(sys.stdin)
try:
    import resource
    resource.setrlimit(resource.RLIMIT_AS, (1024 * 1024 * 1024, 1024 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CPU, (payload['cpu'], payload['cpu'] + 1))
    resource.setrlimit(resource.RLIMIT_FSIZE, (10 * 1024 * 1024, 10 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
except ImportError:
    pass
namespace = {'__name__': '__main__', 'DATASET_DIR': payload['datasets']}
try:
    for index, source in enumerate(payload['cells']):
        exec(compile(source, f'<cell {index + 1}>', 'exec'), namespace)
except BaseException:
    traceback.print_exc()
    sys.exit(1)
