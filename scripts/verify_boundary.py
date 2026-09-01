from pathlib import Path
root=Path(__file__).resolve().parents[1]
runtime=[root/'src',root/'src-tauri/src']
forbidden=['dormant_reference','dormant_execution_bridge','unc_reference_kernel','OpenProcess','WriteProcessMemory','VirtualAllocEx','CreateRemoteThread','NtWriteVirtualMemory','NtCreateThreadEx']
fail=[]
for base in runtime:
    for p in base.rglob('*'):
        if not p.is_file(): continue
        text=p.read_text('utf-8',errors='ignore')
        for token in forbidden:
            if token in text: fail.append(f'{p.relative_to(root)} -> {token}')
if fail:
    print('BOUNDARY FAIL')
    print('\n'.join(fail)); raise SystemExit(1)
print('BOUNDARY PASS: no dormant/cross-process runtime wiring is present in this build.')
