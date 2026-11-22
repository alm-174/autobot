// Cảm biến ảo tìm xe gần nhất phía trước trong làn xe mình.

import { CAR_LENGTH, CAR_WIDTH } from "../../shared/protocol.js";

const SENSOR_RANGE_METERS = 150;
const LANE_WIDTH = 3.6;

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function readLeadSensor(worldState) {
  if (!worldState) return null;

  const { ego } = worldState;
  const longitudinalDistance = (vehicle) => vehicle.position - ego.position - CAR_LENGTH;
  const touchesEgoLane = (vehicle) => (
    Math.abs(vehicle.lane - ego.lane) * LANE_WIDTH <= (LANE_WIDTH + CAR_WIDTH) / 2 + 1e-9
  );
  const cutInCandidate = worldState.vehicles
    .map((vehicle) => ({ vehicle, distance: longitudinalDistance(vehicle) }))
    .filter(({ vehicle, distance }) => (
      vehicle.laneChange?.toLane === ego.lane
      && vehicle.laneChange.fromLane !== ego.lane
      && distance > 0
      && distance < 40
    ))
    .sort((a, b) => a.distance - b.distance)[0];
  const cutIn = cutInCandidate ? {
    detected: true,
    distance: round(cutInCandidate.distance),
    speed: round(cutInCandidate.vehicle.speed),
  } : { detected: false, distance: null, speed: null };

  const candidates = worldState.vehicles
    .map((vehicle) => ({
      vehicle,
      distance: longitudinalDistance(vehicle),
    }))
    .filter(({ vehicle, distance }) => (
      touchesEgoLane(vehicle)
      && distance > 0
      && distance <= SENSOR_RANGE_METERS
    ))
    .sort((a, b) => a.distance - b.distance);

  const nearest = candidates[0];

  if (!nearest) {
    return {
      t: round(worldState.time),
      egoSpeed: round(ego.speed),
      leadDetected: false,
      leadId: null,
      leadDistance: null,
      leadSpeed: null,
      relSpeed: null,
      ttc: null,
      egoLane: ego.lane,
      cutIn,
    };
  }

  const leadSpeed = nearest.vehicle.speed;
  const relativeSpeed = ego.speed - leadSpeed;
  const ttc = relativeSpeed > 0
    ? nearest.distance / (relativeSpeed / 3.6)
    : null;

  return {
    t: round(worldState.time),
    egoSpeed: round(ego.speed),
    leadDetected: true,
    leadId: nearest.vehicle.id,
    leadDistance: round(nearest.distance),
    leadSpeed: round(leadSpeed),
    relSpeed: round(relativeSpeed),
    ttc: ttc === null ? null : round(ttc),
    egoLane: ego.lane,
    cutIn,
  };
}

