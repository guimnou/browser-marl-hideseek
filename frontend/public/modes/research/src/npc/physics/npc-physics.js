// ==============================================================
// FILE: research/src/npc/physics/npc-physics.js
// ==============================================================

import * as GameState from "../../../../../src/core/game-state.js";
import { NPC } from "../config-npc-behavior.js";

//--------------------------------------------------------------//
//                        Physics Constants
//--------------------------------------------------------------//

export const NPC_PHYSICS = {
  GRAVITY: NPC.PHYSICS.GRAVITY,
  TERMINAL_VELOCITY: NPC.PHYSICS.TERMINAL_VELOCITY,
  JUMP_SPEED: NPC.PHYSICS.JUMP_SPEED,
  NPC_WIDTH: NPC.PHYSICS.PLAYER_WIDTH,
  NPC_HEIGHT: NPC.PHYSICS.PLAYER_HEIGHT,
  WALK_SPEED: NPC.PHYSICS.WALK_SPEED,
};

//--------------------------------------------------------------//
//              Internal Physics State & Vectors
//--------------------------------------------------------------//

const newPosition = new THREE.Vector3();
const groundCheckPos = new THREE.Vector3();
const npcBox = new THREE.Box3();
const blockBox = new THREE.Box3();
const blockPosition = new THREE.Vector3();

const npcPhysicsState = new Map();

function initializeNPCPhysicsState(npc) {
  npcPhysicsState.set(npc.uuid, {
    yVelocity: 0,
    isOnGround: false,
    lastPosition: npc.position.clone(),
  });
  return npcPhysicsState.get(npc.uuid);
}

function getNPCPhysicsState(npc) {
  if (!npcPhysicsState.has(npc.uuid)) {
    return initializeNPCPhysicsState(npc);
  }
  return npcPhysicsState.get(npc.uuid);
}

//--------------------------------------------------------------//
//                 Core Physics Functions
//--------------------------------------------------------------//

export function applyNPCGravity(npc, scene, deltaTime) {
  if (npc.physicsEnabled === false) {
    return {
      isOnGround: true,
      justLanded: false,
    };
  }

  const physicsState = getNPCPhysicsState(npc);
  const wasOnGround = physicsState.isOnGround;

  physicsState.yVelocity = Math.max(
    physicsState.yVelocity - NPC_PHYSICS.GRAVITY * deltaTime,
    NPC_PHYSICS.TERMINAL_VELOCITY
  );

  newPosition.copy(npc.position);
  newPosition.y += physicsState.yVelocity * deltaTime;

  const collisionResult = checkNPCCollision(newPosition, scene, npc);
  if (!collisionResult.collides) {
    npc.position.y = newPosition.y;
  } else {
    if (physicsState.yVelocity < 0) {
      physicsState.isOnGround = true;
    }
    physicsState.yVelocity = 0;
  }

  groundCheckPos.copy(npc.position);
  groundCheckPos.y -= 0.1;
  if (!checkNPCCollision(groundCheckPos, scene, npc).collides) {
    physicsState.isOnGround = false;
  }

  npc.isOnGround = physicsState.isOnGround;

  return {
    isOnGround: physicsState.isOnGround,
    justLanded: !wasOnGround && physicsState.isOnGround,
  };
}

export function makeNPCJump(npc, jumpVelocity = NPC_PHYSICS.JUMP_SPEED) {
  const physicsState = getNPCPhysicsState(npc);
  if (!physicsState.isOnGround) return false;

  physicsState.yVelocity = jumpVelocity;
  physicsState.isOnGround = false;
  npc.isOnGround = false;
  return true;
}

function handleNPCMovement(npc, moveVector, scene) {
  const physicsState = getNPCPhysicsState(npc);
  physicsState.lastPosition.copy(npc.position);

  const originalPosition = npc.position.clone();
  newPosition.copy(originalPosition).add(moveVector);

  const directCollision = checkNPCCollision(newPosition, scene, npc);
  if (!directCollision.collides) {
    npc.position.copy(newPosition);
    return { xBlocked: false, zBlocked: false };
  }

  let newX = originalPosition.x;
  let newZ = originalPosition.z;

  newPosition.set(
    originalPosition.x + moveVector.x,
    originalPosition.y,
    originalPosition.z
  );
  const xCollision = checkNPCCollision(newPosition, scene, npc);
  const xBlocked = xCollision.collides;
  if (!xBlocked) {
    newX = originalPosition.x + moveVector.x;
  }

  newPosition.set(
    originalPosition.x,
    originalPosition.y,
    originalPosition.z + moveVector.z
  );
  const zCollision = checkNPCCollision(newPosition, scene, npc);
  const zBlocked = zCollision.collides;
  if (!zBlocked) {
    newZ = originalPosition.z + moveVector.z;
  }

  npc.position.set(newX, originalPosition.y, newZ);

  return { xBlocked, zBlocked };
}

export function moveNPC(npc, direction, speed, scene, deltaTime) {
  if (npc.physicsEnabled === false) {
    return { hasMoved: false, xBlocked: false, zBlocked: false };
  }

  if (!direction || direction.lengthSq() === 0) {
    return { hasMoved: false, xBlocked: false, zBlocked: false };
  }

  const startPosition = npc.position.clone();

  const moveVector = direction
    .clone()
    .normalize()
    .multiplyScalar(speed * deltaTime);
  moveVector.y = 0;

  const { xBlocked, zBlocked } = handleNPCMovement(npc, moveVector, scene);

  enforceNPCBoundaries(npc);

  return {
    hasMoved: !npc.position.equals(startPosition),
    xBlocked,
    zBlocked,
  };
}

//--------------------------------------------------------------//
//              Collision Detection
//--------------------------------------------------------------//

export function checkNPCCollision(position, scene, npc) {
  const collisionWidth = NPC_PHYSICS.NPC_WIDTH * 0.85;
  const collisionHeight = NPC_PHYSICS.NPC_HEIGHT * 0.95;

  npcBox.setFromCenterAndSize(
    position,
    new THREE.Vector3(collisionWidth, collisionHeight, collisionWidth)
  );

  const minX = Math.floor(npcBox.min.x);
  const maxX = Math.ceil(npcBox.max.x);
  const minY = Math.floor(npcBox.min.y);
  const maxY = Math.ceil(npcBox.max.y);
  const minZ = Math.floor(npcBox.min.z);
  const maxZ = Math.ceil(npcBox.max.z);

  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      for (let z = minZ; z < maxZ; z++) {
        const blockType = GameState.getBlockType(x, y, z);
        if (blockType <= 0) continue;

        blockBox.setFromCenterAndSize(
          blockPosition.set(x + 0.5, y + 0.5, z + 0.5),
          new THREE.Vector3(1, 1, 1)
        );

        if (npcBox.intersectsBox(blockBox)) {
          return { collides: true, blockType, blockPosition: { x, y, z } };
        }
      }
    }
  }

  return { collides: false };
}

//--------------------------------------------------------------//
//                     Boundary Enforcement
//--------------------------------------------------------------//

export function enforceNPCBoundaries(npc) {
  if (!npc || !npc.position) return false;

  const worldConfig = GameState.worldConfig;
  if (!worldConfig || !worldConfig.SIZE) return false;

  const worldSize = worldConfig.SIZE;
  const maxHeight = worldConfig.MAX_HEIGHT;
  const buffer = 0.0;
  let wasContained = false;

  if (npc.position.x < buffer) {
    npc.position.x = buffer;
    wasContained = true;
  } else if (npc.position.x > worldSize - buffer) {
    npc.position.x = worldSize - buffer;
    wasContained = true;
  }

  if (npc.position.z < buffer) {
    npc.position.z = buffer;
    wasContained = true;
  } else if (npc.position.z > worldSize - buffer) {
    npc.position.z = worldSize - buffer;
    wasContained = true;
  }

  if (npc.position.y < 0) {
    npc.position.y = 1;
    if (getNPCPhysicsState(npc)) getNPCPhysicsState(npc).yVelocity = 0;
    wasContained = true;
  } else if (npc.position.y > maxHeight - 10) {
    npc.position.y = maxHeight - 10;
    if (getNPCPhysicsState(npc)) getNPCPhysicsState(npc).yVelocity = 0;
    wasContained = true;
  }

  return wasContained;
}

export function resetNPCPhysics(npc) {
  if (!npc) return;
  initializeNPCPhysicsState(npc);
  npc.isOnGround = false;
  npc.pitch = 0;
}

export function updateNPCPhysics(npc, scene, deltaTime) {
  if (!npc || !npc.visible || !npc.position) return;
  applyNPCGravity(npc, scene, deltaTime);
  enforceNPCBoundaries(npc);
}

//--------------------------------------------------------------//
//                        Exports
//--------------------------------------------------------------//

export default {
  NPC_PHYSICS,
  applyNPCGravity,
  makeNPCJump,
  moveNPC,
  checkNPCCollision,
  resetNPCPhysics,
  enforceNPCBoundaries,
  updateNPCPhysics,
};
