#!/usr/bin/env python3
import struct, sys, time
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
PATH="r1-btsnoop.log"
EPOCH=0x00dcddb30f2f8000
RING_CONN=0x000a  # DD:52:92 EVEN R1
def reader(p):
    f=open(p,"rb"); assert f.read(8)[:7]==b"btsnoop"; f.read(8)
    while True:
        h=f.read(24)
        if len(h)<24: break
        o,i,fl,d,ts=struct.unpack(">IIIIq",h); data=f.read(i)
        if len(data)<i: break
        yield ts,data
def t(ts): return time.strftime("%H:%M:%S",time.gmtime((ts-EPOCH)/1e6))+(".%03d"%(((ts-EPOCH)//1000)%1000))
frag={}
rows=[]  # (ts,dir,op,handle,val)
def att(ts,conn,pay,direction):
    if conn!=RING_CONN or not pay: return
    op=pay[0]
    name={0x1b:"NOTIFY",0x1d:"INDICATE",0x12:"WRITE_REQ",0x52:"WRITE_CMD",0x0a:"READ_REQ",0x0b:"READ_RSP",0x13:"WRITE_RSP",0x52:"WRITE_CMD"}.get(op,"op%02x"%op)
    if op in (0x1b,0x1d,0x12,0x52):
        h=struct.unpack("<H",pay[1:3])[0]; rows.append((ts,name,h,pay[3:].hex()))
    elif op in (0x0a,0x0b,0x13):
        rows.append((ts,name,None,pay[1:].hex()))
for ts,data in reader(PATH):
    if not data or data[0]!=0x02: continue
    acl=data[1:]
    if len(acl)<4: continue
    hpb,dl=struct.unpack("<HH",acl[0:4]); conn=hpb&0x0FFF; pb=(hpb>>12)&0x3; body=acl[4:4+dl]
    direction = "?"
    if pb in (0,2):
        if len(body)<4: continue
        l2len,cid=struct.unpack("<HH",body[0:4]); l2=body[4:]
        if len(l2)<l2len: frag[conn]=(l2len-len(l2),l2,cid); continue
        if cid==4: att(ts,conn,l2[:l2len],direction)
    elif pb==1 and conn in frag:
        rem,buf,cid=frag[conn]; buf+=body; rem-=len(body)
        if rem<=0:
            if cid==4: att(ts,conn,buf,direction)
            del frag[conn]
        else: frag[conn]=(rem,buf,cid)
print("=== ALL ring (conn 0x000a, EVEN R1) ATT activity: %d events ==="%len(rows))
for ts,name,h,v in rows:
    hs="h=0x%04x"%h if h is not None else "       "
    print("  %s  %-9s %s  len=%-3d %s"%(t(ts),name,hs,len(v)//2,v))
