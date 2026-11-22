// Mô phỏng chuyển động xe xung quanh theo kịch bản và timeline.

import { CAR_LENGTH, CAR_WIDTH } from "../../shared/protocol.js";

const LANE_WIDTH = 3.6;

export function createWorld() {
  let scenario = null;
  let state = null;
  let handledEvents = new Set();

  function reset() {
    if (!scenario) return;

    state = {
      time: 0,
      playing: false,
      scenarioName: scenario.name,
      ego: {
        lane: scenario.ego.lane,
        position: 0,
        speed: scenario.ego.speed,
      },
      vehicles: scenario.vehicles.map((vehicle) => ({
        id: vehicle.id,
        lane: vehicle.lane,
        position: vehicle.gap,
        speed: vehicle.speed,
        laneChange: null,
        speedControl: null,
      })),
      collision: null,
    };
    handledEvents = new Set();
  }

  function loadScenario(data) {
    scenario = JSON.parse(JSON.stringify(data));
    reset();
    return state;
  }

  function control(action) {
    if (!state) return;
    if (action === "play" && !state.collision) state.playing = true;
    if (action === "pause") state.playing = false;
    if (action === "reset") reset();
  }

  function setEgo(data) {
    if (!state || !data) return;
    if (Number.isFinite(data.speed)) state.ego.speed = data.speed;
    if (Number.isInteger(data.lane)) state.ego.lane = data.lane;
  }

  function applyEvent(event) {
    const vehicle = state.vehicles.find((item) => item.id === event.vehicle);
    if (!vehicle) return;

    if (event.action === "changeLane") {
      vehicle.laneChange = {
        fromLane: vehicle.lane,
        toLane: event.toLane,
        startTime: event.at,
        duration: Math.max(event.duration || 0.1, 0.1),
      };
    }

    if (event.action === "brake") {
      vehicle.speedControl = {
        targetSpeed: event.toSpeed,
        acceleration: Math.max(event.decel || 1, 0.1),
      };
    }

    if (event.action === "setSpeed") {
      vehicle.speedControl = {
        targetSpeed: event.toSpeed,
        acceleration: Math.max(event.accel || 1, 0.1),
      };
    }
  }

  function updateLane(vehicle) {
    if (!vehicle.laneChange) return;

    const change = vehicle.laneChange;
    const progress = Math.min(
      Math.max((state.time - change.startTime) / change.duration, 0),
      1,
    );
    vehicle.lane = change.fromLane + (change.toLane - change.fromLane) * progress;

    if (progress >= 1) {
      vehicle.lane = change.toLane;
      vehicle.laneChange = null;
    }
  }

  function updateSpeed(vehicle, deltaSeconds) {
    if (!vehicle.speedControl) return;

    const controlState = vehicle.speedControl;
    const difference = controlState.targetSpeed - vehicle.speed;
    const step = controlState.acceleration * deltaSeconds * 3.6;

    if (Math.abs(difference) <= step) {
      vehicle.speed = controlState.targetSpeed;
      vehicle.speedControl = null;
      return;
    }

    vehicle.speed += Math.sign(difference) * step;
    vehicle.speed = Math.max(vehicle.speed, 0);
  }

  function update(deltaSeconds) {
    if (!state || !state.playing) return state;

    const delta = Math.min(Math.max(deltaSeconds, 0), 0.25);
    const previousEgoPosition = state.ego.position;
    const previousVehicles = new Map(state.vehicles.map((vehicle) => [vehicle.id, {
      lane: vehicle.lane,
      position: vehicle.position,
    }]));
    state.time += delta;

    scenario.events.forEach((event, index) => {
      if (!handledEvents.has(index) && event.at <= state.time) {
        handledEvents.add(index);
        applyEvent(event);
      }
    });

    for (const vehicle of state.vehicles) {
      updateLane(vehicle);
      updateSpeed(vehicle, delta);
      vehicle.position += (vehicle.speed / 3.6) * delta;
    }

    state.ego.position += (state.ego.speed / 3.6) * delta;

    const collidedVehicle = state.vehicles.find((vehicle) => (
      Math.abs(vehicle.position - state.ego.position) < CAR_LENGTH
      && Math.abs(vehicle.lane - state.ego.lane) * LANE_WIDTH < CAR_WIDTH
    ));
    if (collidedVehicle) {
      // Giữ lại khung cuối an toàn để hai mesh không bị vẽ đè lên nhau.
      state.ego.position = previousEgoPosition;
      for (const vehicle of state.vehicles) {
        const previous = previousVehicles.get(vehicle.id);
        vehicle.position = previous.position;
        vehicle.lane = previous.lane;
      }
      state.playing = false;
      state.collision = {
        t: Math.round(state.time * 100) / 100,
        vehicleId: collidedVehicle.id,
        egoSpeed: Math.round(state.ego.speed * 100) / 100,
      };
    }
    return state;
  }

  function getState() {
    if (!state) return null;

    return {
      ...state,
      ego: { ...state.ego },
      vehicles: state.vehicles.map((vehicle) => {
        let sensorLane = Math.round(vehicle.lane);

        if (vehicle.laneChange) {
          const change = vehicle.laneChange;
          const progress = Math.min(
            Math.max((state.time - change.startTime) / change.duration, 0),
            1,
          );
          sensorLane = progress > 0.5 ? change.toLane : change.fromLane;
        }

        return { ...vehicle, sensorLane };
      }),
    };
  }

  return { loadScenario, control, setEgo, update, getState };
}

