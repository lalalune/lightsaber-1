import metaversefile from 'metaversefile';
import * as THREE from 'three';
import {EffectComposer} from './../../node_modules/three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from './../../node_modules/three/examples/jsm/postprocessing/RenderPass.js';
import {ShaderPass} from './../../node_modules/three/examples/jsm/postprocessing/ShaderPass.js';
import {UnrealBloomPass} from './../../node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js';

const {useApp, useFrame, useLocalPlayer, useComposer, useWear, useSetBeforeComposer, useSetAfterComposer, useCleanup, useScene, useCamera, useRenderer} = metaversefile;

const baseUrl = import.meta.url.replace(/(\/)[^\/\\]*$/, '$1');

const activeAnimation = 'Sword_Activate'
const idleAnimation = 'Idle'
const deActiveAnimation = 'Sword_Deactivate'

export default e => {
  const app = useApp();

  // const sounds = useSound();
  // const soundFiles = sounds.getSoundFiles();
  // const soundIndex = soundFiles.combat.map(sound => sound.name).indexOf('combat/sword_slash0-1.wav');

  const {components} = app;
  const scene = useScene()
  const camera = useCamera()
  const renderer = useRenderer()
  const composer = useComposer()

  console.log(composer)
  const renderScene = composer.passes[0]

  let subApp = null;
  e.waitUntil((async () => {
    const u2 = baseUrl + 'lightsaber_animated.glb';
    const m = await metaversefile.import(u2);

    subApp = metaversefile.createApp({
      name: u2,
    });
    subApp.name = 'lightsaber mesh';
    app.add(subApp);
    subApp.updateMatrixWorld();
    subApp.contentId = u2;
    subApp.instanceId = app.instanceId;

    for (const {key, value} of components) {
      subApp.setComponent(key, value);
    }
    await subApp.addModule(m);

    const blade = subApp.getObjectByName("Blade");
    blade.material = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0.9,
      color: 0xffffff,
      roughness: 0,
      metalness: 0.0,
    });
    blade.isBladeMesh = true

    mixer = new THREE.AnimationMixer(subApp.glb.scene);
  })());

  let wearing = false;
  useWear(e => {
    const {wear} = e;
    wearing = !!wear;
  });

  let aimAnimationTime = 0;
  let currentAnimation = ''
  let mixer = null
  let clip, action

  let isActive = false
  let preAimAction = false
  let aimTriger = false
  let useTriger = false

  const ENTIRE_SCENE = 0
  const BLOOM_SCENE = 20

  const params = {
    exposure: 2,
    bloomStrength: 5,
    bloomThreshold: 0,
    bloomRadius: 0.5,
  };

  const darkMaterial = new THREE.MeshBasicMaterial({color: "black"});
  const materials = {};

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
  bloomPass.threshold = params.bloomThreshold;
  bloomPass.strength = params.bloomStrength;
  bloomPass.radius = params.bloomRadius;

  const bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(renderScene);
  bloomComposer.addPass(bloomPass);
  

  const finalPass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        baseTexture: {value: null},
        bloomTexture: {value: bloomComposer.renderTarget2.texture},
      },
      vertexShader: `
      varying vec2 vUv;
  
      void main() {
  
        vUv = uv;
  
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  
      }
      `,
      fragmentShader: `
      uniform sampler2D baseTexture;
      uniform sampler2D bloomTexture;
  
      varying vec2 vUv;
  
      void main() {
  
        gl_FragColor = ( texture2D( baseTexture, vUv ) + vec4( 1.0 ) * texture2D( bloomTexture, vUv ) );
  
      }
      `,
      defines: {},
    }), "baseTexture",
  );
  finalPass.needsSwap = true;
  // const finalComposer = new EffectComposer(renderer);
  // composer.renderToScreen = false;
  composer.addPass(renderScene);
  composer.addPass(finalPass);

  window.onresize = function () {
    const width = window.innerWidth;
    const height = window.innerHeight;
    bloomComposer.setSize(width, height);
  };

  useSetBeforeComposer(() => {
    scene.traverse(darkenNonBloomed);
    bloomComposer.render();
    scene.traverse(restoreMaterial);
  })

  useSetAfterComposer(() => {
  })

  function darkenNonBloomed(obj) {
    if (obj.material && !obj.isBladeMesh) {
      materials[ obj.uuid ] = obj.material;
      obj.material = darkMaterial;
    }
  }

  function restoreMaterial(obj) {
    if (materials[ obj.uuid ]) {
      obj.material = materials[ obj.uuid ];
      delete materials[ obj.uuid ];
    }
  }

  useFrame(e => {
    const {timestamp, timeDiff} = e;
    const deltaSeconds = timeDiff / 1000;

    const {instanceId} = subApp;
    const {animations} = subApp.glb;
    const localPlayer = useLocalPlayer();

    const userActions = Array.from(localPlayer.getActionsState())
    const wearAction = userActions.find(action => action.type === 'wear' && action.instanceId === instanceId);
    const aimAction = userActions.find(action => action.type === 'aim' && action.instanceId === instanceId);
    const useAction = userActions.find(action => action.type === 'use' && action.instanceId === instanceId);

    aimTriger = (!preAimAction && aimAction)
    preAimAction = !!aimAction

    if (wearAction) {
      if (aimTriger && aimAnimationTime === 0) {
        if (isActive) {
          clip = animations.find(a => a.name === deActiveAnimation);
        } else {
          clip = animations.find(a => a.name === activeAnimation);
        }
      }
      if ((useAction && useTriger && isActive) || (!isActive && useAction)) {
        if (!isActive) isActive = true
        clip = animations.find(a => a.name === idleAnimation);
        useTriger = false
      }
  
      if (clip && currentAnimation !== clip.name) {
        mixer.stopAllAction()
        action = mixer.clipAction(clip);
        action.play();
        currentAnimation = clip.name
        console.error("play animation:", currentAnimation)
      }
  
      if (action && clip) {
        if (!isActive && currentAnimation === activeAnimation) {
          aimAnimationTime += deltaSeconds
          if (aimAnimationTime > clip.duration) {
            action.paused = true
            isActive = true
            aimAnimationTime = 0
            useTriger = true
          }
        }

        if (isActive && currentAnimation === deActiveAnimation) {
          aimAnimationTime += deltaSeconds
          if (aimAnimationTime > clip.duration) {
            isActive = false
            aimAnimationTime = 0
            mixer.stopAllAction()
          }
        }
      }
      
    } else {
      mixer.stopAllAction()
      isActive = false
    }
    
    if (mixer && action) mixer.update(deltaSeconds);

    // renderPostProcessing()
    
    
 























    // if (!saberActive) {
    //   const appAimAction = Array.from(localPlayer.getActionsState())
    //     .find(action => action.type === 'aim' && action.instanceId === instanceId);
    //   const appAnimation = appAimAction?.appAnimation ? animations.find(a => a.name === appAimAction.appAnimation) : null;
    //   if (appAnimation && !appAimAnimationMixers) {
            
    //     const clip = animations.find(a => a.name === appAimAction.appAnimation);
    //     const activeAnimationDuration = clip.duration
    //     if (clip) {
    //       appAimAnimationMixers = [];
    //       subApp.glb.scene.traverse(o => {
    //         if (o.isMesh) {
    //           const mixer = new THREE.AnimationMixer(o);
              
    //           const action = mixer.clipAction(clip);
    //           action.play();

    //           const appAimAnimationMixer = {
    //             update(deltaSeconds) {
    //               startAnimationTime += deltaSeconds
    //               if (activeAnimationDuration < startAnimationTime) {
    //                 saberActive = true
    //                 action.paused = true;
    //               } else {
    //                 mixer.update(deltaSeconds);
    //               }
    //             },
    //             destroy() {
    //               action.stop();
    //             },
    //           };
    //           appAimAnimationMixers.push(appAimAnimationMixer);
    //         }
    //       });
    //       console.log(appAnimation, appAimAnimationMixers)
    //     }
    //   } else if (appAimAnimationMixers && !appAnimation) {
    //     for (const appAimAnimationMixer of appAimAnimationMixers) {
    //       appAimAnimationMixer.destroy();
    //     }
    //     appAimAnimationMixers = null;
    //   }
    //   if (appAimAnimationMixers) {
    //     const deltaSeconds = timeDiff / 1000;
    //     for (const mixer of appAimAnimationMixers) {
    //       mixer.update(deltaSeconds);
    //       app.updateMatrixWorld();
    //     }
    //   }
    // }
    
    
  });

  useCleanup(() => {
    subApp && subApp.destroy();
  });

  app.getPhysicsObjects = () => subApp ? subApp.getPhysicsObjects() : [];

  return app;
};