#!/usr/bin/env python3
"""Add the indexes the POS's list queries need to every record type of an exported CloudKit schema (.ckdb).

Every list in the app is a query with no filter, newest first. CloudKit refuses it ("recordName is not queryable" / "modifiedAt is not
sortable") for any record type that lacks:  "___recordID" REFERENCE QUERYABLE  and  "___modTime" TIMESTAMP QUERYABLE SORTABLE.
Record types the Development environment created on first write have neither. Fields are never touched, so no type can clash.

  python3 scripts/ckdb_add_indexes.py schema.ckdb > schema-indexed.ckdb
Prints what it changed to stderr. Users and "cloudkit.share" are CloudKit's own types and are left alone.
"""
import re, sys

SKIP = {'Users', '"cloudkit.share"'}
REC = '        "___recordID"   REFERENCE QUERYABLE,'
MOD = '        "___modTime"    TIMESTAMP QUERYABLE SORTABLE,'

def fix(text: str):
    changes = []
    def one(m):
        name, body = m.group(1), m.group(2)
        if name in SKIP: return m.group(0)
        lines = body.split('\n'); out = []; had_rec = had_mod = False
        for ln in lines:
            if re.match(r'\s*"___recordID"', ln):
                had_rec = True
                if not re.search(r'QUERYABLE', ln): ln = REC; changes.append(f'{name}: recordID made queryable')
            elif re.match(r'\s*"___modTime"', ln):
                had_mod = True
                if not (re.search(r'QUERYABLE', ln) and re.search(r'SORTABLE', ln)): ln = MOD; changes.append(f'{name}: modTime made queryable and sortable')
            out.append(ln)
        # new lines go straight after the first line (the type's opening), before the fields
        add = []
        if not had_rec: add.append(REC); changes.append(f'{name}: recordID index added')
        if not had_mod: add.append(MOD); changes.append(f'{name}: modTime index added')
        if add:
            i = next((k for k, l in enumerate(out) if l.strip()), 0)
            out[i:i] = add
        return f'RECORD TYPE {name} (' + '\n'.join(out) + '\n    );'
    return re.sub(r'RECORD TYPE (\S+) \((.*?)\n    \);', one, text, flags=re.S), changes

if __name__ == '__main__':
    src = open(sys.argv[1]).read()
    new, changes = fix(src)
    sys.stdout.write(new)
    print('\n'.join(changes) or 'nothing to change', file=sys.stderr)
