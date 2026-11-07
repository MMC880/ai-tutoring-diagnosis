"""Monotonic evidence of attempted external calls; restoration must never rewind it."""
import json
import os
from pathlib import Path
from store import ValidationError, dump

NAME='ai-outbound-ledger.jsonl'


def parse(raw):
    try:
        if len(raw)>16*1024*1024: raise ValueError('size')
        rows={}
        for line in raw.decode('utf-8').splitlines():
            if not line.strip(): continue
            row=json.loads(line)
            if not isinstance(row,dict) or set(row)!={'job_id','config_hash','at'}: raise ValueError('fields')
            if not isinstance(row['job_id'],str) or len(row['job_id'])!=32 or any(c not in '0123456789abcdef' for c in row['job_id']): raise ValueError('id')
            if not isinstance(row['config_hash'],str) or len(row['config_hash'])!=64 or any(c not in '0123456789abcdef' for c in row['config_hash']): raise ValueError('hash')
            if not isinstance(row['at'],str) or not row['at'] or len(row['at'])>60: raise ValueError('time')
            if row['job_id'] in rows and rows[row['job_id']]['config_hash']!=row['config_hash']: raise ValueError('conflict')
            rows.setdefault(row['job_id'],row)
        return rows
    except (ValueError,TypeError,KeyError,UnicodeError) as exc:
        raise ValidationError('AI发送凭据损坏，已阻止新调用；请保留文件并核查，不要删除凭据后重试') from exc


def read(root):
    p=Path(root)/NAME
    return parse(p.read_bytes()) if p.exists() else {}


def combine(left,right):
    rows=dict(left)
    for ident,row in right.items():
        if ident in rows and rows[ident]['config_hash']!=row['config_hash']:
            raise ValidationError('备份与本地AI发送凭据冲突，已停止恢复')
        rows.setdefault(ident,row)
    return rows


def append(root,record):
    rows=read(root); checked=parse((dump(record)+'\n').encode())
    combine(rows,checked)
    if record['job_id'] in rows: return False
    with (Path(root)/NAME).open('a',encoding='utf-8',newline='\n') as f:
        f.write(dump(record)+'\n'); f.flush(); os.fsync(f.fileno())
    return True


def merge(root,records):
    current=read(root); combine(current,records)
    for ident,row in records.items():
        if ident not in current: append(root,row)
