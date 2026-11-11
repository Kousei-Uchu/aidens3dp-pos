#!/usr/bin/env python3
"""Add the indexes the POS's list queries need to every record type of an exported CloudKit schema (.ckdb).

Every list in the app is a query with no filter, newest first. CloudKit refuses it ("recordName is not queryable" / "modifiedAt is not
sortable") for any record type that lacks:  "___recordID" REFERENCE QUERYABLE  and  "___modTime" TIMESTAMP QUERYABLE SORTABLE.
Record types the Development environment created on first write have neither. Fields are never touched, so no type can clash.

  python3 scripts/ckdb_add_indexes.py schema.ckdb > schema-indexed.ckdb
Prints what it changed to stderr. Users and "cloudkit.share" are CloudKit's own types and are left alone.
It also adds any record type the app uses (scripts/cloudkit-record-types.json, checked against the Swift by tests/ckdbtypes.test.ts) that the
schema lacks, as a type with only the system fields and the two indexes. Its own fields are not listed: Development adds each one, with the
right type, on the first write, and a field type guessed here could clash with what the app really sends.
"""
import json, os, re, sys

SKIP = {'Users', '"cloudkit.share"'}
REC = '        "___recordID"   REFERENCE QUERYABLE,'
MOD = '        "___modTime"    TIMESTAMP QUERYABLE SORTABLE,'

STUB = ('    RECORD TYPE {name} (\n' + '        "___createTime" TIMESTAMP QUERYABLE SORTABLE,\n        "___createdBy"  REFERENCE,\n        "___etag"       STRING,\n'
        + MOD + '\n        "___modifiedBy" REFERENCE,\n' + REC + '\n        GRANT WRITE TO "_creator",\n        GRANT CREATE TO "_icloud",\n        GRANT READ TO "_world"\n    );')

def required_types():
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cloudkit-record-types.json')) as f: return json.load(f)

def fix(text: str):
    changes = []
    have = set(re.findall(r'RECORD TYPE (\S+) \(', text))
    missing = [t for t in required_types() if t not in have]
    for t in missing: changes.append(f'{t}: type did not exist, added with its indexes')
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
    out = re.sub(r'RECORD TYPE (\S+) \((.*?)\n    \);', one, text, flags=re.S)
    if missing: out = out.rstrip('\n') + '\n\n' + '\n\n'.join(STUB.format(name=t) for t in missing) + '\n'
    return out, changes

if __name__ == '__main__':
    src = open(sys.argv[1]).read()
    new, changes = fix(src)
    sys.stdout.write(new)
    print('\n'.join(changes) or 'nothing to change', file=sys.stderr)
