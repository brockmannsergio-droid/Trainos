import { NextResponse } from 'next/server';

function writeUInt16LE(val: number): number[] {
  return [val & 0xFF, (val >> 8) & 0xFF];
}

function writeUInt32LE(val: number): number[] {
  return [val & 0xFF, (val >> 8) & 0xFF, (val >> 16) & 0xFF, (val >> 24) & 0xFF];
}

function crc16(data: number[]): number {
  const crcTable = [0x0000,0xCC01,0xD801,0x1400,0xF001,0x3C00,0x2800,0xE401,0xA001,0x6C00,0x7800,0xB401,0x5000,0x9C01,0x8801,0x4400];
  let crc = 0;
  for (const byte of data) {
    let tmp = crcTable[crc & 0xF]; crc = (crc >> 4) & 0x0FFF;
    crc = crc ^ tmp ^ crcTable[byte & 0xF];
    tmp = crcTable[crc & 0xF]; crc = (crc >> 4) & 0x0FFF;
    crc = crc ^ tmp ^ crcTable[(byte >> 4) & 0xF];
  }
  return crc;
}

function buildFitWorkout(workout: any): Uint8Array {
  const steps = workout.steps || [];
  const workoutName = (workout.name || 'TrainOS Workout').substring(0, 16);
  const sportMap: {[key: string]: number} = { running: 1, run: 1, cycling: 2, ride: 2 };
  const sport = sportMap[workout.sport?.toLowerCase() || 'running'] || 1;
  const records: number[] = [];

  // File Header (14 bytes)
  records.push(14, 0x10, 0x08, 0x02, 0,0,0,0, 0x2E,0x46,0x49,0x54, 0,0);
  const dataStart = records.length;

  // Definition: workout (local 0)
  records.push(0x40, 0, 0, 0x1A, 0, 5);
  records.push(4,1,0, 5,4,0x86, 6,2,0x84, 8,16,7, 11,1,0);

  // Workout record
  records.push(0x00, sport, 0x20,0,0,0);
  records.push(...writeUInt16LE(steps.length));
  const nameBytes = Array.from({length:16}, (_,i) => workoutName.charCodeAt(i) || 0);
  records.push(...nameBytes, 0);

  // Definition: workout_step (local 1)
  records.push(0x41, 0, 0, 0x1B, 0, 7);
  records.push(0,16,7, 1,4,0x86, 2,1,0, 3,2,0x84, 4,4,0x86, 5,2,0x84, 6,4,0x86);

  // Steps
  for (const step of steps) {
    const stype = step.type || 'interval';
    const duration = Math.round((step.duration || 600) * 1000);
    const zoneNum = step.zoneNumber || 0;
    const intensityMap: {[key: string]: number} = { warmup:2, cooldown:3, rest:1, recovery:1, interval:0 };
    const intensity = intensityMap[stype] ?? 0;
    const stepName = Array.from({length:16}, (_,i) => stype.charCodeAt(i) || 0);
    records.push(0x01, ...stepName, 0,0,0,0, intensity, 0,0, ...writeUInt32LE(duration), 0,0, ...writeUInt32LE(zoneNum));
  }

  // Fill data size
  const dataSize = records.length - dataStart;
  records[4]=dataSize&0xFF; records[5]=(dataSize>>8)&0xFF;
  records[6]=(dataSize>>16)&0xFF; records[7]=(dataSize>>24)&0xFF;

  // Header CRC
  const hCrc = crc16(records.slice(0,12));
  records[12]=hCrc&0xFF; records[13]=(hCrc>>8)&0xFF;

  // Data CRC
  const dCrc = crc16(records.slice(dataStart));
  records.push(dCrc&0xFF, (dCrc>>8)&0xFF);

  return new Uint8Array(records);
}

export async function POST(request: Request) {
  try {
    const { workout } = await request.json();
    if (!workout) return NextResponse.json({ error: 'No workout' }, { status: 400 });
    const fitData = buildFitWorkout(workout);
    const name = (workout.name || 'trainos-workout').replace(/[^a-z0-9]/gi, '_');
    return new NextResponse(fitData, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${name}.fit"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
