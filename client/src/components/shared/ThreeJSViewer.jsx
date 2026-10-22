// client/src/components/shared/ThreeJSViewer.jsx
import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { useLanguage } from '../../context/LanguageContext';
import { resolveModelUrl } from '../../utils/model3dUrls';

// ---------------------------------------------------------------------------
// Tunables — adjust these to taste without touching the logic below.
// ---------------------------------------------------------------------------
const DEBUG = false; // flip to true to get verbose console diagnostics back
const TONE_MAPPING_EXPOSURE = 1.05;
const ENV_INTENSITY = 1.0;
const HEMI_LIGHT_INTENSITY = 0.6;
const KEY_LIGHT_INTENSITY = 2.0;
const FILL_LIGHT_INTENSITY = 0.5;
const RIM_LIGHT_INTENSITY = 1.1;
const LOAD_TIMEOUT_MS = 30000;
const HINT_VISIBLE_MS = 4000;

// --- Post-processing tunables --------------------------------------------
const POSTFX_ENABLED = true;
const SHADOW_MAP_SIZE = 4096;
const MAX_PIXEL_RATIO = 2; // hard ceiling regardless of device, for perf safety
const SSAO_ENABLED = true;
const SSAO_RADIUS = 0.35;
const SSAO_INTENSITY = 1.4;
const BLOOM_ENABLED = true;
const BLOOM_STRENGTH = 0.35; // subtle — highlights bleed, not a glow effect
const BLOOM_RADIUS = 0.4;
const BLOOM_THRESHOLD = 0.85; // only near-blown-out pixels bloom

// ---------------------------------------------------------------------------
// Shared DRACO decoder instance (Google-hosted decoder, works out of the box).
// For production you may want to self-host these files under /public/draco/
// and point setDecoderPath at that instead, for offline/CDN-outage safety.
// ---------------------------------------------------------------------------
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

function disposeMaterial(material) {
  if (!material) return;
  Object.keys(material).forEach((key) => {
    const value = material[key];
    if (value && value.isTexture) value.dispose();
  });
  material.dispose();
}

function disposeObject3D(object) {
  if (!object) return;
  object.traverse((child) => {
    if (child.isMesh) {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach(disposeMaterial);
      } else {
        disposeMaterial(child.material);
      }
    }
  });
}

const ThreeJSViewer = ({ modelUrl, className = 'w-full h-96' }) => {
  const { t } = useLanguage();
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const composerRef = useRef(null);
  const ssaoPassRef = useRef(null);
  const bloomPassRef = useRef(null);
  const animationIdRef = useRef(null);
  const loadedModelRef = useRef(null);
  const groundRef = useRef(null);
  const envTextureRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [showHint, setShowHint] = useState(false);

  // -------------------------------------------------------------------------
  // One-time bootstrap: scene, camera, renderer, lights, environment, controls.
  // This now runs ONCE (not on every modelUrl change) so swapping models no
  // longer tears down and rebuilds the whole WebGL context.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = null; // transparent — matches original behavior
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      50,
      mount.clientWidth / mount.clientHeight || 1,
      0.1,
      2000
    );
    camera.position.set(4, 3, 6);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.capabilities.getMaxAnisotropy(); // warms the query; used per-texture on load
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // <- was missing entirely
    renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // --- Image-based lighting: neutral studio environment (built into three) ---
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.035).texture;
    scene.environment = envTexture;
    if ('environmentIntensity' in scene) {
      scene.environmentIntensity = ENV_INTENSITY;
    }
    envTextureRef.current = envTexture;
    pmremGenerator.dispose();

    // --- Lighting: hemisphere fill + key + rim, tuned for ACES + env map ---
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x3a3a3a, HEMI_LIGHT_INTENSITY);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, KEY_LIGHT_INTENSITY);
    keyLight.position.set(5, 8, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    keyLight.shadow.bias = -0.0003;
    keyLight.shadow.normalBias = 0.015;
    keyLight.shadow.radius = 2; // extra softening on top of PCFSoft
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 50;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xdce8ff, FILL_LIGHT_INTENSITY);
    fillLight.position.set(-6, 3, -4);
    scene.add(fillLight);

    // Rim light: kicks a thin edge highlight from behind so the model
    // separates from a busy/transparent background instead of silhouetting flat.
    const rimLight = new THREE.DirectionalLight(0xfff2e0, RIM_LIGHT_INTENSITY);
    rimLight.position.set(-2, 4, -8);
    scene.add(rimLight);

    // --- Soft ground contact shadow (invisible plane, only its shadow shows) ---
    const groundGeo = new THREE.PlaneGeometry(50, 50);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.25 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.visible = false; // shown once a model's bounds are known
    scene.add(ground);
    groundRef.current = ground;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.5;
    controls.maxDistance = 200;
    controls.maxPolarAngle = Math.PI * 0.98;
    controlsRef.current = controls;

    // -----------------------------------------------------------------------
    // Post-processing pipeline. MSAA is unavailable once we're compositing
    // through a render target, so SMAA stands in for antialiasing here.
    // Order matters: SSAO darkens contact creases before bloom picks up
    // highlights, and OutputPass does the final color-space/tone-map resolve.
    // -----------------------------------------------------------------------
    let composer = null;
    if (POSTFX_ENABLED) {
      const dpr = renderer.getPixelRatio();
      const width = mount.clientWidth;
      const height = mount.clientHeight;

      composer = new EffectComposer(renderer);
      composer.setPixelRatio(dpr);
      composer.setSize(width, height);
      composerRef.current = composer;

      composer.addPass(new RenderPass(scene, camera));

      if (SSAO_ENABLED) {
        const ssaoPass = new SSAOPass(scene, camera, width, height);
        ssaoPass.kernelRadius = SSAO_RADIUS;
        ssaoPass.minDistance = 0.0005;
        ssaoPass.maxDistance = 0.15;
        ssaoPass.output = SSAOPass.OUTPUT.Default;
        if ('intensity' in ssaoPass) ssaoPass.intensity = SSAO_INTENSITY;
        composer.addPass(ssaoPass);
        ssaoPassRef.current = ssaoPass;
      }

      if (BLOOM_ENABLED) {
        const bloomPass = new UnrealBloomPass(
          new THREE.Vector2(width, height),
          BLOOM_STRENGTH,
          BLOOM_RADIUS,
          BLOOM_THRESHOLD
        );
        composer.addPass(bloomPass);
        bloomPassRef.current = bloomPass;
      }

      const smaaPass = new SMAAPass(width * dpr, height * dpr);
      composer.addPass(smaaPass);

      composer.addPass(new OutputPass()); // applies renderer's tone mapping + color space
    }

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      controls.update();
      if (composerRef.current) {
        composerRef.current.render();
      } else {
        renderer.render(scene, camera);
      }
    };
    animate();

    const resizeObserver = new ResizeObserver(() => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);

      if (composerRef.current) {
        const dpr = renderer.getPixelRatio();
        composerRef.current.setSize(width, height);
        ssaoPassRef.current?.setSize(width, height);
        bloomPassRef.current?.setSize(width, height);
        // SMAAPass sizes its internal buffers directly to device pixels
        composerRef.current.passes.forEach((pass) => {
          if (pass instanceof SMAAPass) pass.setSize(width * dpr, height * dpr);
        });
      }
    });
    resizeObserver.observe(mount);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationIdRef.current);
      controls.dispose();
      disposeObject3D(loadedModelRef.current);
      groundGeo.dispose();
      groundMat.dispose();
      envTextureRef.current?.dispose();

      if (composerRef.current) {
        composerRef.current.passes.forEach((pass) => pass.dispose?.());
        composerRef.current.renderTarget1?.dispose();
        composerRef.current.renderTarget2?.dispose();
        composerRef.current = null;
        ssaoPassRef.current = null;
        bloomPassRef.current = null;
      }

      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []); // bootstrap runs once

  // -------------------------------------------------------------------------
  // Model loading — runs whenever modelUrl (or a manual retry) changes.
  // Only swaps the model; scene/renderer/lights stay alive.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const ground = groundRef.current;
    if (!scene || !camera || !controls || !modelUrl) return;

    const resolvedModelUrl = resolveModelUrl(modelUrl);
    if (!resolvedModelUrl) {
      setError('Invalid model URL. Please try refreshing the page.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setProgress(0);

    if (loadedModelRef.current) {
      scene.remove(loadedModelRef.current);
      disposeObject3D(loadedModelRef.current);
      loadedModelRef.current = null;
    }
    if (ground) ground.visible = false;

    let cancelled = false;

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    loader.setMeshoptDecoder(MeshoptDecoder);

    const loadingTimeout = setTimeout(() => {
      if (cancelled) return;
      setError('Model loading timed out. The file may be too large or the server unreachable.');
      setLoading(false);
    }, LOAD_TIMEOUT_MS);

    loader.load(
      resolvedModelUrl,
      (gltf) => {
        if (cancelled) return;
        clearTimeout(loadingTimeout);

        try {
          const model = gltf.scene || gltf.scenes?.[0];
          let meshCount = 0;

          const renderer = rendererRef.current;
          const maxAnisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;

          model.traverse((child) => {
            if (child.isMesh) {
              meshCount++;
              child.castShadow = true;
              child.receiveShadow = true;
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((mat) => {
                if (!mat) return;
                // Metallic surfaces read the environment map directly and benefit
                // from a stronger reflection; rough dielectrics get a lighter touch
                // so they don't look washed out under the studio env.
                if ('envMapIntensity' in mat) {
                  const metalness = mat.metalness ?? 0;
                  mat.envMapIntensity = ENV_INTENSITY * (0.6 + metalness * 0.8);
                }
                // Sharpen grazing-angle texture detail (floors, decals, fine text)
                // instead of the default mip blur.
                ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach((slot) => {
                  const tex = mat[slot];
                  if (tex && maxAnisotropy > 1) tex.anisotropy = maxAnisotropy;
                });
                mat.needsUpdate = true;
              });
            }
          });

          if (meshCount === 0) {
            setError('This model has no visible geometry.');
            setLoading(false);
            return;
          }

          // 1) Measure the model in its own units.
          const rawBox = new THREE.Box3().setFromObject(model);
          const rawSize = rawBox.getSize(new THREE.Vector3());
          if (rawSize.x === 0 && rawSize.y === 0 && rawSize.z === 0) {
            setError('This model has invalid (zero-size) geometry.');
            setLoading(false);
            return;
          }

          // 2) Scale to a consistent on-screen size FIRST.
          const maxDimension = Math.max(rawSize.x, rawSize.y, rawSize.z);
          const targetSize = 3;
          const scale = maxDimension > 0 ? targetSize / maxDimension : 1;
          model.scale.setScalar(scale);

          // 3) THEN measure again and center — fixes off-center models that
          //    the original code produced whenever scale strayed far from 1.
          const scaledBox = new THREE.Box3().setFromObject(model);
          const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
          model.position.sub(scaledCenter);

          model.name = 'loaded-model';
          scene.add(model);
          loadedModelRef.current = model;

          const finalBox = new THREE.Box3().setFromObject(model);

          if (ground) {
            ground.position.y = finalBox.min.y;
            ground.visible = true;
          }

          // 4) Frame the camera using real FOV math instead of a guessed multiplier.
          const sphere = finalBox.getBoundingSphere(new THREE.Sphere());
          const fitDistance = sphere.radius / Math.sin((camera.fov * Math.PI) / 360);
          const direction = new THREE.Vector3(1, 0.6, 1).normalize();
          camera.position.copy(direction.multiplyScalar(fitDistance * 1.3));
          camera.near = Math.max(fitDistance / 100, 0.01);
          camera.far = fitDistance * 100;
          camera.updateProjectionMatrix();

          controls.target.set(0, 0, 0);
          controls.minDistance = fitDistance * 0.3;
          controls.maxDistance = fitDistance * 8;
          controls.update();

          setLoading(false);
        } catch (err) {
          if (DEBUG) console.error('ThreeJSViewer: error processing model', err);
          setError('Error processing 3D model.');
          setLoading(false);
        }
      },
      (evt) => {
        if (cancelled || !evt.total) return;
        setProgress(Math.round((evt.loaded / evt.total) * 100));
      },
      (err) => {
        if (cancelled) return;
        clearTimeout(loadingTimeout);
        if (DEBUG) console.error('ThreeJSViewer: load error', err);
        setError(`Failed to load 3D model: ${err.message || 'unknown error'}`);
        setLoading(false);
      }
    );

    return () => {
      cancelled = true;
      clearTimeout(loadingTimeout);
    };
  }, [modelUrl, reloadKey]);

  // Fade the controls hint out after a few seconds instead of leaving it on-screen.
  useEffect(() => {
    if (loading || error) {
      setShowHint(false);
      return;
    }
    setShowHint(true);
    const hideTimer = setTimeout(() => setShowHint(false), HINT_VISIBLE_MS);
    return () => clearTimeout(hideTimer);
  }, [loading, error]);

  return (
    <div className={`relative ${className}`}>
      <div ref={mountRef} className="w-full h-full" />

      {loading && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-neutral-950/70 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 rounded-full border-2 border-white/10" />
              <div className="absolute inset-0 rounded-full border-2 border-t-blue-400 border-r-blue-400 border-transparent animate-spin" />
            </div>
            <div className="text-sm text-white/80 font-medium">
              {progress > 0 ? `Loading model — ${progress}%` : 'Loading model…'}
            </div>
            {progress > 0 && (
              <div className="w-40 h-1 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-blue-400 transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {error && !loading && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-neutral-950/80 backdrop-blur-sm"
          role="alert"
        >
          <div className="flex flex-col items-center gap-3 max-w-xs text-center px-4">
            <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <p className="text-sm text-red-300">{error}</p>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="text-xs font-medium px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div
          className={`absolute bottom-4 left-4 bg-neutral-950/60 backdrop-blur-sm text-white/70 text-[11px] leading-relaxed px-3 py-2 rounded-lg pointer-events-none transition-opacity duration-500 ${
            showHint ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div>Drag to rotate · Right-drag to pan · Scroll to zoom</div>
        </div>
      )}
    </div>
  );
};

export default ThreeJSViewer;