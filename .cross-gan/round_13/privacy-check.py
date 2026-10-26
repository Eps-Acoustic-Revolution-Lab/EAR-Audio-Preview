"""Bounded release hygiene scan; reports locations/counts, never matched values."""
import json,re,subprocess,zipfile,hashlib
from pathlib import Path
secret=re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|xox[baprs]-[0-9A-Za-z-]{20,})')
private_path=re.compile(rb'/(?:Users|home)/[^/\s"<>]+/')
files=subprocess.check_output(['git','ls-files','-z']).decode().split('\0')
tracked_hits=[];private_files=[]
for name in filter(None,files):
 data=Path(name).read_bytes()
 if secret.search(data):tracked_hits.append(name)
 if private_path.search(data):private_files.append(name)
with zipfile.ZipFile('ear-audio-preview-0.6.1.vsix') as z:
 shipped_hits=[n for n in z.namelist() if secret.search(z.read(n))]
 shipped_private=[n for n in z.namelist() if private_path.search(z.read(n))]
 dev_assets=[n for n in z.namelist() if re.match(r'extension/(?:\.cross-gan|doc|bench|packages|artifacts)/',n)]
 count=len(z.namelist())
 upstream=Path('node_modules/ebur128-wasm/ebur128_wasm_bg.wasm').read_bytes()
 upstream_paths=[n for n in shipped_private if z.read(n)==upstream]
 own_paths=[n for n in shipped_private if n not in upstream_paths]
ignored=subprocess.run(['git','check-ignore','--no-index','.cross-gan/round_13/native/session.json'],capture_output=True).returncode==0
result={'scope':'Current tracked tree and rebuilt VSIX; pattern scan is not an exhaustive historical secret audit','trackedCredentialPatternHits':tracked_hits,'trackedPrivatePathFiles':private_files,'privatePathAssessment':'Historical development/research paths are provenance, not credentials. Retained; excluded from VSIX.','vsixEntryCount':count,'vsixCredentialPatternHits':shipped_hits,'vsixPrivatePathHits':shipped_private,'byteIdenticalUpstreamWasmPathFiles':upstream_paths,'upstreamWasmSha256':hashlib.sha256(upstream).hexdigest(),'unclassifiedShippedPathFiles':own_paths,'vsixDevelopmentAssets':dev_assets,'newNativeSessionIgnored':ignored}
print(json.dumps(result,indent=2))
assert not tracked_hits and not shipped_hits and not own_paths and not dev_assets and ignored
