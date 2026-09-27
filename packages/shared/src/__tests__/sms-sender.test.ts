import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BANK_SENDER_ENTITIES, isAllowlistedSender, senderEntity } from '../sms/sender';

describe('senderEntity', () => {
  it('takes the 6-character entity whatever the operator prefix', () => {
    assert.equal(senderEntity('AD-HDFCBK'), 'HDFCBK');
    assert.equal(senderEntity('VM-HDFCBK'), 'HDFCBK');
    assert.equal(senderEntity('JD-SBIINB'), 'SBIINB');
  });

  it('accepts the TRAI category suffix and normalises case', () => {
    assert.equal(senderEntity('AD-HDFCBK-S'), 'HDFCBK');
    assert.equal(senderEntity('vm-icicib-t'), 'ICICIB');
  });

  it('returns null for anything that is not a DLT header', () => {
    for (const sender of ['+919876543210', '9876543210', 'HDFCBK', '', 'AD-HDFC', 'AD-HDFCBKX', 'ADX-HDFCBK', 'AD-HDFCBK-X']) {
      assert.equal(senderEntity(sender), null, sender);
    }
  });
});

describe('isAllowlistedSender', () => {
  it('accepts registered banks on any route', () => {
    for (const sender of ['AD-HDFCBK', 'VM-HDFCBK', 'JD-SBIINB', 'BZ-AXISBK', 'TX-KOTAKB-S']) {
      assert.equal(isAllowlistedSender(sender), true, sender);
    }
  });

  it('rejects a well-formed header from a business that is not a bank', () => {
    assert.equal(isAllowlistedSender('AD-AMAZON'), false);
    assert.equal(isAllowlistedSender('VM-SWIGGY'), false);
  });

  it('rejects phone numbers, bare entities and the empty string', () => {
    for (const sender of ['+919876543210', 'HDFCBK', '']) assert.equal(isAllowlistedSender(sender), false, sender);
  });

  it('accepts an extra entity only when it is passed in', () => {
    assert.equal(isAllowlistedSender('AD-NEWBNK'), false);
    assert.equal(isAllowlistedSender('AD-NEWBNK', ['NEWBNK']), true);
    assert.equal(isAllowlistedSender('AD-NEWBNK', ['newbnk']), true);
    assert.equal(isAllowlistedSender('AD-OTHERB', ['NEWBNK']), false);
  });

  it('ships at least 8 banks, all well-formed and unique', () => {
    assert.ok(BANK_SENDER_ENTITIES.length >= 8);
    assert.equal(new Set(BANK_SENDER_ENTITIES).size, BANK_SENDER_ENTITIES.length);
    for (const entity of BANK_SENDER_ENTITIES) assert.match(entity, /^[A-Z0-9]{6}$/);
  });
});
