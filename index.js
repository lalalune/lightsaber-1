import metaversefile from 'metaversefile';
const {useApp, useFrame, useLocalPlayer, useUse, useWear, useCleanup, useSound} = metaversefile;

const baseUrl = import.meta.url.replace(/(\/)[^\/\\]*$/, '$1');

export default e => {
  const app = useApp();

  // const sounds = useSound();
  // const soundFiles = sounds.getSoundFiles();
  // const soundIndex = soundFiles.combat.map(sound => sound.name).indexOf('combat/sword_slash0-1.wav');

  const {components} = app;

  let subApp = null;
  e.waitUntil((async () => {
    let u2 = baseUrl + 'lightsaber.glb';
    if (/^https?:/.test(u2)) {
      u2 = '/@proxy/' + u2;
    }
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
  })());

  let wearing = false;
  useWear(e => {
    const {wear} = e;
    wearing = !!wear;
  });
  // const animationOffset = {
  //   swordSideSlash: 350,
  //   swordSideSlashStep: 150,
  //   swordTopDownSlash: 100,
  //   swordTopDownSlashStep: 150,
  // };
  let startAnimationTime = 0;
  // let playSoundSw = false;
  let lastPlaySoundAnimationIndex = null;
  useFrame(() => {
    const localPlayer = useLocalPlayer();
    if (localPlayer.avatar && wearing) {
      if (localPlayer.avatar.useAnimationIndex >= 0 && localPlayer.avatar.useAnimationIndex !== lastPlaySoundAnimationIndex) {
        if (startAnimationTime === 0) {
          startAnimationTime = performance.now();
        }
        // if (
        //   performance.now() - startAnimationTime >= animationOffset[localPlayer.avatar.useAnimationCombo[localPlayer.avatar.useAnimationIndex]] &&
        //   !playSoundSw
        // ) {
        //   const indexOfSlash = localPlayer.avatar.useAnimationIndex;
        //   sounds.playSound(soundFiles.combat[soundIndex + (4 * indexOfSlash + Math.floor(Math.random() * 4))]);
        //   localPlayer.characterSfx.playGrunt('attack');
        //   playSoundSw = true;
        //   lastPlaySoundAnimationIndex = localPlayer.avatar.useAnimationIndex;
        // }
      } else {
        // playSoundSw = false;
        startAnimationTime = 0;
      }
      if (!(localPlayer.avatar.useAnimationIndex >= 0)) lastPlaySoundAnimationIndex = null;
    }
  });

  useCleanup(() => {
    subApp && subApp.destroy();
  });

  app.getPhysicsObjects = () => subApp ? subApp.getPhysicsObjects() : [];

  return app;
};
