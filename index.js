import * as THREE from 'three';
// import Simplex from './simplex-noise.js';
import metaversefile from 'metaversefile';
const {useApp, useFrame, useScene, useInternals, useLocalPlayer, useActivate, useUse, useWear, usePhysics, getAppByPhysicsId, useCleanup} = metaversefile;

const baseUrl = import.meta.url.replace(/(\/)[^\/\\]*$/, '$1');

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localVector3 = new THREE.Vector3();
const localQuaternion = new THREE.Quaternion();

export default () => {
  const app = useApp();
  const scene = useScene();
  const {renderer, camera, sceneLowPriority} = useInternals();
  const physics = usePhysics();

  const {components} = app;

  const swordBackOffset = 0.5;
  const swordLength = 1.4;
  const maxNumDecals = 128;
  const normalScale = 0.04;
  // const decalGeometry = new THREE.PlaneBufferGeometry(0.5, 0.5, 8, 8).toNonIndexed();
  const numSegments = 128;
  const planeGeometry = new THREE.PlaneBufferGeometry(1, 1, 1, 1)
    // .applyMatrix4(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 0, 1), Math.PI*0.5))
    .applyMatrix4(new THREE.Matrix4().makeTranslation(0, -0.5, 0))
    .applyMatrix4(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), -Math.PI*0.5))
    .toNonIndexed();
  window.planeGeometry = planeGeometry;
  
  const texture = new THREE.TextureLoader().load(baseUrl + 'chevron2.svg');
  const decalMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xFF0000,
    map: texture,
    side: THREE.DoubleSide,
    // transparent: true,
  });

  // const m = new THREE.Mesh(planeGeometry, decalMaterial);
  // scene.add(m);
  const boxGeometry = new THREE.BoxBufferGeometry(0.1, 0.1, 0.1);
  const boxGeometry3 = new THREE.BoxBufferGeometry(0.01, 0.01, 0.01);
  const currentTransformMesh = new THREE.Mesh(boxGeometry, new THREE.MeshBasicMaterial({color: 0xff0000}));
  scene.add(currentTransformMesh);
  const backTransformMesh = new THREE.Mesh(boxGeometry, new THREE.MeshBasicMaterial({color: 0x0000ff}));
  scene.add(backTransformMesh);

  const box2Geometry = new THREE.BoxBufferGeometry(0.005, 0.005, 1)
    .applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, -0.5))
    .applyMatrix4(new THREE.Matrix4().makeScale(1, 1, swordBackOffset + swordLength))

  const _makeDecalMesh = () => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(planeGeometry.attributes.position.array.length * numSegments * maxNumDecals);
    const positionsAttribute = new THREE.BufferAttribute(positions, 3);
    geometry.setAttribute('position', positionsAttribute);
    const normals = new Float32Array(planeGeometry.attributes.normal.array.length * numSegments * maxNumDecals);
    const normalsAttribute = new THREE.BufferAttribute(normals, 3);
    geometry.setAttribute('normal', normalsAttribute);
    const uvs = new Float32Array(planeGeometry.attributes.uv.array.length * numSegments * maxNumDecals);
    const uvsAttribute = new THREE.BufferAttribute(uvs, 2);
    geometry.setAttribute('uv', uvsAttribute);
    // const indices = new Uint16Array(planeGeometry.index.array.length * maxNumDecals);
    // const indicesAttribute = new THREE.BufferAttribute(indices, 1);
    // geometry.setIndex(indicesAttribute);

    const decalMesh = new THREE.Mesh(geometry, decalMaterial);
    decalMesh.name = 'DecalMesh';
    decalMesh.frustumCulled = false;
    decalMesh.offset = 0;
    let startSwordTransform = null;
    let lastSwordTransform = null;
    let lastHitPoint = null;
    const width = 0.2;
    const thickness = 0.05;
    decalMesh.update = (using, matrixWorldSword, matrixWorldShoulder) => {
      const _getCurrentSwordTransform = () => {
        matrixWorldSword.decompose(localVector, localQuaternion, localVector2);
        localQuaternion.multiply(
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI*0.5)
        );
        const swordPosition = localVector.clone();
        const swordQuaternion = localQuaternion.clone();

        matrixWorldShoulder.decompose(localVector, localQuaternion, localVector2);
        const shoulderPosition = localVector.clone();
        const shoulderQuaternion = localQuaternion.clone();

        return {
          swordPosition,
          swordQuaternion,
          shoulderPosition,
          shoulderQuaternion,
          /* line: new THREE.Line3(
            localVector.clone()
              .add(
                new THREE.Vector3(0, 0, swordBackOffset)
                  .applyQuaternion(localQuaternion)
              ),
            localVector.clone()
              .add(
                new THREE.Vector3(0, 0, -swordLength)
                  .applyQuaternion(localQuaternion)
              )
          ), */
        };
      };
      const endSwordTransform = _getCurrentSwordTransform();

      // debug meshes
      {
        currentTransformMesh.position.copy(
          endSwordTransform.swordPosition
        ).add(
          new THREE.Vector3(0, 0, -swordLength)
            .applyQuaternion(endSwordTransform.swordQuaternion)
        );
        currentTransformMesh.quaternion.copy(endSwordTransform.swordQuaternion);
        currentTransformMesh.updateMatrixWorld();

        backTransformMesh.position.copy(endSwordTransform.shoulderPosition);
        backTransformMesh.quaternion.copy(endSwordTransform.shoulderQuaternion);
        backTransformMesh.updateMatrixWorld();
      }

      if (!using) {
        startSwordTransform = endSwordTransform;
        lastSwordTransform = endSwordTransform;
        lastHitPoint = null;
        return;
      }

      const _lerpSwordTransform = (a, b, f) => {
        // console.log('lerp', f);
        return {
          swordPosition: a.swordPosition.clone().lerp(b.swordPosition, f),
          swordQuaternion: a.swordQuaternion.clone().slerp(b.swordQuaternion, f),
          shoulderPosition: a.shoulderPosition.clone().lerp(b.shoulderPosition, f),
          shoulderQuaternion: a.shoulderQuaternion.clone().slerp(b.shoulderQuaternion, f),
          /* line: new THREE.Line3(
            a.line.start.clone().lerp(b.line.start, f),
            a.line.end.clone().lerp(b.line.end, f),
          ), */
        };
      };
      const _getNextPoint = (currentSwordTransform, i) => {
        // raycasts.push([startSwordTransform.position.toArray(), endSwordTransform.position.toArray(), currentSwordTransform.position.toArray(), currentSwordTransform.quaternion.toArray()]);
        const _getLineQuaternion = (line, q) => {
          return q.setFromRotationMatrix(
            new THREE.Matrix4().lookAt(
              line.start,
              line.end,
              new THREE.Vector3(0, 1, 0)
            ) 
          );
        };

        const line = new THREE.Line3(
          currentSwordTransform.shoulderPosition,
          currentSwordTransform.swordPosition.clone()
            .add(new THREE.Vector3(0, 0, -swordLength).applyQuaternion(currentSwordTransform.swordQuaternion))
        );
        const lineQuaternion = _getLineQuaternion(line, new THREE.Quaternion());
        let result = physics.raycast(line.start, lineQuaternion);
        
        /* if (!result) {
          line.start.copy(currentSwordTransform.shoulderPosition);
          // line.end.copy(currentSwordTransform.swordPosition);
          _getLineQuaternion(line, lineQuaternion);
          result = physics.raycast(line.start, lineQuaternion);
        } */

        if (result) {
          const hitPoint = new THREE.Vector3().fromArray(result.point);
          if (hitPoint.distanceTo(line.start) <= line.distance()) {
            /* // debug meshes
            // {
              const hitMesh = new THREE.Mesh(boxGeometry3, new THREE.MeshBasicMaterial({color: i === 0 ? 0x00FF00 : 0x808080}));
              hitMesh.position.copy(hitPoint);
              hitMesh.updateMatrixWorld();
              scene.add(hitMesh);
            // } */

            const normal = line.start.clone().sub(line.end)
              .normalize();
            const hitNormal = new THREE.Vector3().fromArray(result.normal);

            const normalScaled = normal.clone().multiplyScalar(normalScale);
            const normalBack = normal.clone().multiplyScalar(swordBackOffset);
    
            const normalDownQuaternion = new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 0, 1),
              normal
            );
    
            let rotationMatrix;
            let localWidth;
            if (lastHitPoint) {
              rotationMatrix = new THREE.Matrix4().lookAt(
                lastHitPoint.hitPoint,
                hitPoint,
                normal
              );
              localWidth = lastHitPoint.hitPoint.distanceTo(hitPoint);
            } else {
              const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
                hitNormal,
                hitPoint
              );
              let lineProjection = plane.intersectLine(line, new THREE.Vector3());
              if (!lineProjection) {
                lineProjection = line.end.clone();
              }
              rotationMatrix = new THREE.Matrix4().lookAt(
                lineProjection,
                hitPoint,
                hitNormal
              );
              localWidth = width*0.5;
            }

            return {
              hitPoint,
              // centerPoint,
              // forwardPoint,
              // swordQuaternion: currentSwordTransform.quaternion.clone(),
              rotationMatrix,
              normal,
              normalBack,
              normalScaled,
              normalDownQuaternion,
              width: localWidth,
              thickness,
              forwardLeftPoint: null,
              forwardRightPoint: null,
            };
          } else {
            return false;
          }
        } else {
          return 0;
        }
      };
      const localDecalGeometries = [];
      // let firstHit = false;
      const _drawPoints = () => {
        for (let i = 1; i < numSegments; i++) {
          const f = i/(numSegments - 1);

          const currentSwordTransform = _lerpSwordTransform(startSwordTransform, endSwordTransform, f);
          /* if (using) {
            const hitMesh = new THREE.Mesh(boxGeometry, new THREE.MeshBasicMaterial({color: i === 0 ? 0x00FF00 : 0x808080}));
            hitMesh.position.copy(currentSwordTransform.position)
              .add(new THREE.Vector3(0, 0, -swordLength).applyQuaternion(currentSwordTransform.quaternion));
            hitMesh.quaternion.copy(currentSwordTransform.quaternion);
            hitMesh.updateMatrixWorld();
            scene.add(hitMesh);

            const hitMesh2 = new THREE.Mesh(
              box2Geometry,
              new THREE.MeshBasicMaterial({color: 0x00FF00})
            );
            hitMesh2.position.copy(currentSwordTransform.position)
              .add(new THREE.Vector3(0, 0, swordBackOffset).applyQuaternion(currentSwordTransform.quaternion));
            hitMesh2.quaternion.copy(currentSwordTransform.quaternion);
            hitMesh2.updateMatrixWorld();
            scene.add(hitMesh2);
          } */
          const nextPoint = _getNextPoint(currentSwordTransform, i);
          
          /* if (!firstHit && i === 0 && !!nextPoint) {
            firstHit = true;
          }
          if (firstHit) {
            if (i === 0) {
              console.log('hit 0', {currentSwordTransform, startSwordTransform, endSwordTransform, lastSwordTransform, nextPoint, lastHitPoint, });
            } else if (i === 1) {
              console.log('hit 1', {currentSwordTransform, startSwordTransform, endSwordTransform, lastSwordTransform, nextPoint, lastHitPoint, });
            } else if (i === (numSegments - 2)) {
              console.log('hit -2', {currentSwordTransform, startSwordTransform, endSwordTransform, lastSwordTransform, nextPoint, lastHitPoint, });
            } else if (i === (numSegments - 1)) {
              console.log('hit -1', {currentSwordTransform, startSwordTransform, endSwordTransform, lastSwordTransform, nextPoint, lastHitPoint, });
            }
          } */

          if (nextPoint) {
            // console.log('hit', i);
            let {hitPoint, rotationMatrix, normal, normalBack, normalScaled, normalDownQuaternion, width, thickness} = nextPoint;

            const localDecalGeometry = planeGeometry.clone();
            
            /* if (lastHitPoint) {
              rotationMatrix = new THREE.Matrix4().lookAt(
                lastHitPoint.forwardPoint,
                forwardPoint,
                lastHitPoint.normal
              );
              normal = new THREE.Vector3(0, 1, 0).applyMatrix4(rotationMatrix);
              normalDownQuaternion = new THREE.Quaternion()
                .setFromRotationMatrix(rotationMatrix)
                .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI*0.5));
              normalScaled = normal.clone().multiplyScalar(normalScale);
            } */
            localDecalGeometry
              .applyMatrix4(new THREE.Matrix4().makeScale(thickness, 1, width))
              .applyMatrix4(rotationMatrix)
              .applyMatrix4(new THREE.Matrix4().makeTranslation(
                hitPoint.x,
                hitPoint.y,
                hitPoint.z
              ));

            // if there was a previous point, copy the last point's forward points to the next point's backward points
            if (lastHitPoint) {
              // console.log('lp 1');
              for (let j = 0; j < localDecalGeometry.attributes.position.count; j++) {
                localVector.fromArray(planeGeometry.attributes.position.array, j*3);
                if (localVector.z >= 1) { // if this is a backward point
                  // console.log('got');
                  const isLeft = localVector.x < 0;
                  (isLeft ? lastHitPoint.forwardLeftPoint : lastHitPoint.forwardRightPoint)
                  // localVector.fromArray(decalGeometry.attributes.position.array, lastOffset + srcIndex * 3)
                    .toArray(localDecalGeometry.attributes.position.array, j*3);
                }
              }
              // console.log('lp 2');
            }

           // make the local decal geometry conform to the object mesh by raycasting from the decal mesh points down the normal
            for (let j = 0; j < localDecalGeometry.attributes.position.count; j++) {
              localVector.fromArray(planeGeometry.attributes.position.array, j*3);
              if (
                (localVector.z < 1) || // if this is a forward point
                !lastHitPoint // if this is the first point in the chain
              ) {
                localVector.fromArray(localDecalGeometry.attributes.position.array, j*3)
                  .add(normalBack);
                const result = physics.raycast(localVector, normalDownQuaternion);
                if (result) {
                  localVector3.fromArray(result.point);
                  if (localVector.distanceTo(localVector3) < (swordBackOffset + swordLength)) {
                    localVector3
                      .add(normalScaled)
                      .toArray(localDecalGeometry.attributes.position.array, j*3);
                  }
                }
              }
            }

            /* for (let i = 0; i < localDecalGeometry.attributes.position.array.length; i++) {
              if (isNaN(localDecalGeometry.attributes.position.array[i])) {
                debugger;
              }
            } */

            nextPoint.forwardLeftPoint = new THREE.Vector3().fromArray(localDecalGeometry.attributes.position.array, 0*3);
            nextPoint.forwardRightPoint = new THREE.Vector3().fromArray(localDecalGeometry.attributes.position.array, 2*3);
            localDecalGeometries.push(localDecalGeometry);
          }

          lastSwordTransform = currentSwordTransform;
          lastHitPoint = nextPoint;
        }
      };
      _drawPoints();
      decalMesh.mergeGeometries(localDecalGeometries);
      startSwordTransform = endSwordTransform;
      lastSwordTransform = endSwordTransform;
    };
    const updateRanges = [];
    decalMesh.mergeGeometries = localDecalGeometies => {
      if (localDecalGeometies.length > 0) {
        const _makeUpdateRange = () => ({
          position: {
            offset: decalMesh.offset*3,
            count: 0,
          },
          uv: {
            offset: decalMesh.offset*2,
            count: 0,
          },
          normal: {
            offset: decalMesh.offset*3,
            count: 0,
          },
        });
        const lastUpdateRange = updateRanges.length > 0 ? updateRanges[updateRanges.length - 1] : null;
        let updateRange = (
          lastUpdateRange &&
            ((lastUpdateRange.position.offset + lastUpdateRange.position.count) < decalMesh.geometry.attributes.position.count*3)
        ) ? lastUpdateRange : null;
        for (const localDecalGeometry of localDecalGeometies) {
          const startOffset = decalMesh.offset;
          
          for (let i = 0; i < localDecalGeometry.attributes.position.count; i++) {
            decalMesh.geometry.attributes.position.setXYZ( i + startOffset, localDecalGeometry.attributes.position.getX(i), localDecalGeometry.attributes.position.getY(i), localDecalGeometry.attributes.position.getZ(i) );
            decalMesh.geometry.attributes.uv.setXY( i + startOffset, localDecalGeometry.attributes.uv.getX(i), localDecalGeometry.attributes.uv.getY(i) );
            decalMesh.geometry.attributes.normal.setXYZ( i + startOffset, localDecalGeometry.attributes.normal.getX(i), localDecalGeometry.attributes.normal.getY(i), localDecalGeometry.attributes.normal.getZ(i) );
            // decalMesh.geometry.index.setX( i + offset, localDecalGeometry.index.getX(i) );
          }

          // flag geometry attributes for update
          if (!updateRange) {
            updateRange = _makeUpdateRange();
            updateRanges.push(updateRange);
          }
          updateRange.position.count += localDecalGeometry.attributes.position.count*3;
          updateRange.uv.count += localDecalGeometry.attributes.uv.count*2;
          updateRange.normal.count += localDecalGeometry.attributes.normal.count*3;

          // update geometry attribute offset
          decalMesh.offset += localDecalGeometry.attributes.position.count;
          if (decalMesh.offset >= decalMesh.geometry.attributes.position.count) {
            decalMesh.offset = decalMesh.offset % decalMesh.geometry.attributes.position.count;
            updateRange = null;
          }
        }
      }
    };
    decalMesh.pushGeometryUpdate = () => {
      const updateRange = updateRanges.shift();
      if (updateRange) {
        decalMesh.geometry.attributes.position.updateRange = updateRange.position;
        decalMesh.geometry.attributes.position.needsUpdate = true;
        decalMesh.geometry.attributes.uv.updateRange = updateRange.uv;
        decalMesh.geometry.attributes.uv.needsUpdate = true;
        decalMesh.geometry.attributes.normal.updateRange = updateRange.normal;
        decalMesh.geometry.attributes.normal.needsUpdate = true;
      }
    };

    return decalMesh;
  };
  const decalMesh = _makeDecalMesh();
  scene.add(decalMesh);
  class TrailMesh extends THREE.Mesh {
    constructor(a, b) {
      const numPositions = 256;

      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(6*3*numPositions);
      const positionAttribute = new THREE.BufferAttribute(positions, 3);
      geometry.setAttribute('position', positionAttribute);
      const ts = new Float32Array(positions.length/3);
      const tAttribute = new THREE.BufferAttribute(ts, 1);
      geometry.setAttribute('t', tAttribute);
      geometry.setDrawRange(0, 0);
      
      const trailVsh = `\
        ${THREE.ShaderChunk.common}
        // #define PI 3.1415926535897932384626433832795

        uniform float uTime;
        attribute float t;
        varying float vT;

        /* mat4 rotationMatrix(vec3 axis, float angle)
        {
            axis = normalize(axis);
            float s = sin(angle);
            float c = cos(angle);
            float oc = 1.0 - c;
            
            return mat4(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
                        oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
                        oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
                        0.0,                                0.0,                                0.0,                                1.0);
        }

        varying float vDepth; */

        ${THREE.ShaderChunk.logdepthbuf_pars_vertex}

        void main() {
          float f = 1. - pow((uTime - vT)/100., 0.1);
          vec3 p = (f >= -1.) ? position : vec3(0.);
          // vec3 p = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
          vT = t;
          ${THREE.ShaderChunk.logdepthbuf_vertex}
        }
      `;
      const trailFsh = `\
        // #define PI 3.1415926535897932384626433832795
        
        // uniform sampler2D uTex;
        // uniform vec3 uColor;
        uniform float uTime;
        varying float vT;
        
        // vec3 grey = vec3(0.5);
        vec3 grey = vec3(0.7);
        ${THREE.ShaderChunk.logdepthbuf_pars_fragment}

        void main() {
          float f = 1. - pow((uTime - vT)/100., 0.1);
          if (f >= 0.) {
            gl_FragColor = vec4(grey, f);
          } else {
            discard;
          }
          ${THREE.ShaderChunk.logdepthbuf_fragment}
        }
      `;
      const material = new THREE.ShaderMaterial({
        uniforms: {
          /* uColor: {
            type: 'c',
            value: new THREE.Color(0xef5350),
            needsUpdate: true,
          }, */
          uTime: {
            type: 'f',
            value: 0,
            needsUpdate: true,
          },
        },
        vertexShader: trailVsh,
        fragmentShader: trailFsh,
        side: THREE.DoubleSide,
        // depthWrite: false,
        transparent: true,
      });
      
      super(geometry, material);
      this.frustumCulled = false;

      this.a = a;
      this.b = b;
      this.lastAWorld = new THREE.Vector3(NaN, NaN, NaN);
      this.lastBWorld = new THREE.Vector3(NaN, NaN, NaN);
      this.positionIndex = 0;
      this.tIndex = 0;
      this.lastNow = -Infinity;
      this.lastEnabled = false;
      this.lastTriggerStartTime = -Infinity;
    }
    update(enabled, matrixWorld) {
      let now = performance.now();

      if (enabled && !this.lastEnabled) {
        this.lastAWorld.set(NaN, NaN, NaN);
        this.lastBWorld.set(NaN, NaN, NaN);
        this.positionIndex = 0;
        this.tIndex = 0;
        this.lastNow = -Infinity;
        this.lastTriggerStartTime = now;
      }
      now -= this.lastTriggerStartTime;
      // console.log('got now', now);

      if (enabled && !isNaN(this.lastAWorld.x) && !isNaN(this.lastBWorld.x)) {
        const positions = this.geometry.attributes.position.array;
        const ts = this.geometry.attributes.t.array;

        {
          const startIndex = this.positionIndex;

          this.lastAWorld
            .toArray(positions, this.positionIndex);
          this.positionIndex += 3;

          this.lastBWorld
            .toArray(positions, this.positionIndex);
          this.positionIndex += 3;

          localVector.copy(this.b)
            .applyMatrix4(matrixWorld)
            .toArray(positions, this.positionIndex);
          this.positionIndex += 3;

          this.lastAWorld
            .toArray(positions, this.positionIndex);
          this.positionIndex += 3;

          localVector.copy(this.b)
            .applyMatrix4(matrixWorld)
            .toArray(positions, this.positionIndex);
          this.positionIndex += 3;

          localVector.copy(this.a)
            .applyMatrix4(matrixWorld)
            .toArray(positions, this.positionIndex);
          this.positionIndex += 3;

          this.geometry.attributes.position.updateRange = {
            offset: startIndex,
            count: (this.positionIndex - startIndex),
          };
          this.geometry.attributes.position.needsUpdate = true;

          this.positionIndex = this.positionIndex % this.geometry.attributes.position.array.length;
        }
        {
          const startIndex = this.tIndex;

          ts[this.tIndex++] = this.lastNow;
          ts[this.tIndex++] = this.lastNow;
          ts[this.tIndex++] = now;
          ts[this.tIndex++] = this.lastNow;
          ts[this.tIndex++] = now;
          ts[this.tIndex++] = now;

          this.geometry.attributes.t.updateRange = {
            offset: startIndex,
            count: (this.tIndex - startIndex),
          };
          this.geometry.attributes.t.needsUpdate = true;

          this.tIndex = this.tIndex % this.geometry.attributes.t.array.length;
        }
      } 

      this.lastAWorld.copy(this.a)
        .applyMatrix4(matrixWorld);
      this.lastBWorld.copy(this.b)
        .applyMatrix4(matrixWorld);
      this.lastNow = now;
      this.lastEnabled = enabled;

      this.geometry.setDrawRange(0, this.positionIndex/3);

      this.material.uniforms.uTime.value = now;
      this.material.uniforms.uTime.needsUpdate = true;
    }
  }
  let trailMesh = null;
  const useComponent = components.find(component => component.key === 'use');
  const trail = useComponent?.value.trail;
  // console.log('got trail', components, useComponent, trail);
  if (Array.isArray(trail)) {
    const a = new THREE.Vector3().fromArray(trail[0]);
    const b = new THREE.Vector3().fromArray(trail[1]);
    trailMesh = new TrailMesh(a, b);
    sceneLowPriority.add(trailMesh);
    // window.trailMesh = trailMesh;
  }

  let subApp = null;
  (async () => {
    const u2 = baseUrl + 'megasword_v4_texta.glb';
    const m = await metaversefile.import(u2);

    subApp = metaversefile.createApp({
      name: u2,
    });
    subApp.position.copy(app.position);
    subApp.quaternion.copy(app.quaternion);
    subApp.scale.copy(app.scale);
    subApp.updateMatrixWorld();
    subApp.contentId = u2;
    subApp.instanceId = app.instanceId;

    for (const {key, value} of components) {
      subApp.setComponent(key, value);
    }
    await subApp.addModule(m);
    scene.add(subApp);
  })();

  useActivate(() => {
    const localPlayer = useLocalPlayer();
    localPlayer.wear(app);
  });

  // let wearing = false;
  useWear(e => {
    const {wear} = e;
    if (subApp) {
      subApp.dispatchEvent({
        type: 'wearupdate',
        wear,
      });
    }
    // wearing = !!wear;
  });

  let using = false;
  useUse(e => {
    using = e.use;
  });

  useFrame(() => {
    if (trailMesh && subApp) {
      trailMesh.update(using, subApp.matrixWorld);
    }
    if (decalMesh) {
      const localPlayer = useLocalPlayer();
      if (subApp && localPlayer.avatar) {
        decalMesh.update(using, subApp.matrixWorld, localPlayer.avatar.modelBones.Right_arm.matrixWorld);
      }

      decalMesh.pushGeometryUpdate();
    }
  });

  useCleanup(() => {
    trailMesh && sceneLowPriority.remove(trailMesh);
    decalMesh && scene.remove(decalMesh);
  });

  app.getPhysicsObjects = () => {
    const result = subApp ? subApp.getPhysicsObjects() : [];
    return result;
  };

  return app;
};