import test from 'node:test';
import assert from 'node:assert/strict';
import {consultarAviso} from './paymentNoticeClient.mjs';
const now=()=>new Date('2026-10-20T18:00:00Z');
const notice={ciclo:'2026-10',fecha:'2026-10-15',texto:'Pago pendiente',pendiente:true,vigenteEl:'2026-10-20'};
const read=aviso=>consultarAviso({baseUrl:'https://walletclub.com.mx',token:'test',now,fetchImpl:async()=>new Response(JSON.stringify({aviso}))});
test('current authenticated pending notice survives original due date',async()=>assert.deepEqual(await read(notice),notice));
test('stale pending responses and ordinary overdue notices are rejected',async()=>{
 assert.equal(await read({...notice,vigenteEl:'2026-10-19'}),null);
 assert.equal(await read({...notice,pendiente:false}),null);
 assert.equal(await read({...notice,ciclo:'2026-09'}),null);
 assert.equal(await read(null),null);
});
