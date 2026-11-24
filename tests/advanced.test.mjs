import test from 'node:test';
import assert from 'node:assert/strict';
import {creditModel} from '../advanced.js';
const x={principal:75,annualRate:.12,months:36,collateral:100,haircut:.25,cfads:74,existingService:10,pd:.03,lgd:.45,ccf:.5,undrawn:10};test('amortisation reconciles and expected loss uses EAD',()=>{const a=creditModel(x);assert.ok(Math.abs(a.schedule.reduce((s,r)=>s+r.principal,0)-75)<1e-8);assert.equal(a.schedule.at(-1).balance,0);assert.ok(Math.abs(a.expectedLoss-1.08)<1e-8)});test('zero interest and invalid tenor',()=>{assert.equal(creditModel({...x,annualRate:0,months:15}).payment,5);assert.throws(()=>creditModel({...x,months:0}))});
