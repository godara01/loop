#!/usr/bin/env node
// Runs one Maestro flow through scripts/e2e.sh, and plays the part of the bank
// for the SMS flows: when the flow's output shows it is ready, deliver its
// messages with `adb emu sms send`.
//
//   node scripts/e2e-flow.mjs e2e/flows/sms-debit-approve.yaml
//
// A flow opts in through its `env:` block:
//   SMS_AFTER   regex on a Maestro output line — send once it appears
//   SMS_SEND    comma list of env keys to send, numbers are pauses in seconds,
//               e.g. "SMS_BODY,4,CONTROL_BODY"; SMS_SENDER (CONTROL_SENDER for
//               CONTROL_BODY) is the sender
//   REMOTE_CONFIG_SMS_INGEST  "false" publishes the kill switch off to
//               loop-app-0403 for the run, and back on afterwards
//
// Every run starts with the emulator's SMS store emptied (needs `adb root`), so
// one flow's messages never reach another's backfill.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAllDocuments } from 'yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SERIAL = process.env.LOOP_SERIAL || 'emulator-5554';
const ADB = join(process.env.ANDROID_HOME || join(process.env.HOME, 'Android/Sdk'), 'platform-tools/adb');
const adb = (...args) => spawnSync(ADB, ['-s', SERIAL, ...args], { encoding: 'utf8' });

const flow = process.argv[2];
if (!flow) {
  console.error('usage: node scripts/e2e-flow.mjs <flow.yaml>');
  process.exit(2);
}
const env = parseAllDocuments(readFileSync(flow, 'utf8'))[0].toJS()?.env ?? {};

function publishSmsIngest(value) {
  const template = { parameters: { sms_ingest_enabled: { defaultValue: { value }, valueType: 'BOOLEAN' } } };
  const firebase = JSON.parse(readFileSync(join(ROOT, 'firebase.json'), 'utf8'));
  const templatePath = join(ROOT, '.tmp-remoteconfig.json');
  const configPath = join(ROOT, '.tmp-firebase.json');
  writeFileSync(templatePath, JSON.stringify(template));
  writeFileSync(configPath, JSON.stringify({ ...firebase, remoteconfig: { template: templatePath } }));
  const run = spawnSync('npx', ['firebase', 'deploy', '--only', 'remoteconfig', '--project', 'loop-app-0403', '--config', configPath], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  rmSync(templatePath, { force: true });
  rmSync(configPath, { force: true });
  const ok = run.stdout.includes('Deploy complete');
  console.log(`e2e-flow: remote config sms_ingest_enabled=${value} ${ok ? 'published' : 'FAILED to publish'}`);
  return ok;
}

async function deliver() {
  for (const step of String(env.SMS_SEND ?? 'SMS_BODY').split(',').map((s) => s.trim())) {
    if (/^\d+$/.test(step)) {
      await new Promise((r) => setTimeout(r, Number(step) * 1000));
      continue;
    }
    const sender = step === 'CONTROL_BODY' ? env.CONTROL_SENDER : env.SMS_SENDER;
    adb('emu', 'sms', 'send', sender, env[step]);
    console.log(`e2e-flow: sent ${step}`);
  }
}

// Root is needed to clear the SMS store; adbd restarting as root drops the
// Metro reverse, which e2e.sh re-adds.
adb('root');
spawnSync(ADB, ['-s', SERIAL, 'wait-for-device']);
adb('shell', 'content', 'delete', '--uri', 'content://sms');

const killSwitch = env.REMOTE_CONFIG_SMS_INGEST === 'false';
if (killSwitch && !publishSmsIngest('false')) process.exit(1);

const trigger = env.SMS_AFTER ? new RegExp(env.SMS_AFTER) : null;
let fired = false;
const child = spawn('bash', [join(ROOT, 'scripts/e2e.sh'), flow], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
let pending = '';
child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  pending += chunk;
  const lines = pending.split('\n');
  pending = lines.pop();
  if (trigger && !fired && lines.some((line) => trigger.test(line))) {
    fired = true;
    void deliver();
  }
});
const code = await new Promise((r) => child.on('close', r));
if (killSwitch) publishSmsIngest('true');
if (trigger && !fired) console.error('e2e-flow: SMS_AFTER never matched — no message was sent');
process.exit(code ?? 1);
