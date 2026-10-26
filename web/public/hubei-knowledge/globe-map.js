import * as THREE from './assets/vendor/three/three.module.min.js';
import { SVGLoader } from './assets/vendor/three/SVGLoader.js';
import { surroundingLand } from './assets/map/surrounding-land.js';
import { alignedHubei } from './assets/map/hubei-aligned.js';

const minimumZoom = .8;
const maximumZoom = 8;
const defaultZoom = 1.6;
const angularScale = .00265;
const mapRadius = 1.001;
let geometryCache;

function prepareMap(provinces, cities, transform) {
  if (geometryCache) return geometryCache;
  const loader = new SVGLoader();
  const parse = (path, localTransform) => {
    const document = loader.parse(`<svg xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="${path}"/></svg>`);
    return document.paths.flatMap(path => SVGLoader.createShapes(path)).map(shape => {
      const convert = point => new THREE.Vector2(point.x * localTransform.sx + localTransform.tx, point.y * localTransform.sy + localTransform.ty);
      const points = shape.extractPoints(1);
      return { contour: points.shape.map(convert), holes: points.holes.map(hole => hole.map(convert)) };
    });
  };
  const cityShapes = cities.map(city => ({ ...city, shapes: parse(city.d, transform) }));
  const fromCoordinates = shapes => shapes.map(({ contour, holes }) => ({ contour: contour.map(point => new THREE.Vector2(...point)), holes: holes.map(ring => ring.map(point => new THREE.Vector2(...point))) }));
  const bounds = new THREE.Box2();
  cityShapes.forEach(city => city.shapes.forEach(shape => shape.contour.forEach(point => bounds.expandByPoint(point))));
  const center = bounds.getCenter(new THREE.Vector2());
  const onSphere = (point, radius = 1) => {
    const longitude = (point.x - center.x) * angularScale;
    const latitude = 2 * Math.atan(Math.exp((center.y - point.y) * angularScale)) - Math.PI / 2;
    return new THREE.Vector3(Math.sin(longitude) * Math.cos(latitude), Math.sin(latitude), Math.cos(longitude) * Math.cos(latitude)).multiplyScalar(radius);
  };
  const build = (shapes, radius, coastlines) => {
    const positions = [];
    const outlines = [];
    const triangle = (first, second, third) => {
      const lengths = [first.distanceToSquared(second), second.distanceToSquared(third), third.distanceToSquared(first)];
      const longest = Math.max(...lengths);
      if (longest > 100) {
        if (longest === lengths[0]) {
          const middle = first.clone().add(second).multiplyScalar(.5);
          triangle(first, middle, third);
          triangle(middle, second, third);
        } else if (longest === lengths[1]) {
          const middle = second.clone().add(third).multiplyScalar(.5);
          triangle(first, second, middle);
          triangle(first, middle, third);
        } else {
          const middle = third.clone().add(first).multiplyScalar(.5);
          triangle(first, second, middle);
          triangle(middle, second, third);
        }
        return;
      }
      [first, second, third].forEach(point => positions.push(...onSphere(point, radius).toArray()));
    };
    shapes.forEach(({ contour, holes }) => {
      const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
      const vertices = [...contour, ...holes.flat()];
      faces.forEach(face => triangle(...face.map(index => vertices[index])));
    });
    const paths = coastlines || shapes.flatMap(({ contour, holes }) => [contour, ...holes].map(ring => [...ring, ring[0]]));
    paths.forEach(path => {
      for (let index = 1; index < path.length; index++) {
        const point = path[index - 1];
        const next = path[index];
        const steps = Math.max(1, Math.ceil(point.distanceTo(next) / 6));
        for (let step = 0; step < steps; step++) {
          outlines.push(...onSphere(point.clone().lerp(next, step / steps), radius + .00035).toArray());
          outlines.push(...onSphere(point.clone().lerp(next, (step + 1) / steps), radius + .00035).toArray());
        }
      }
    });
    return { positions, outlines };
  };
  geometryCache = {
    surroundings: build(surroundingLand.polygons.map(({ contour, holes }) => ({ contour: contour.map(point => new THREE.Vector2(...point)), holes: holes.map(ring => ring.map(point => new THREE.Vector2(...point))) })), 1.00045, surroundingLand.coastlines.map(path => path.map(point => new THREE.Vector2(...point)))),
    provinces: provinces.map(province => ({ ...province, ...build(parse(province.d, { sx: 1, sy: 1, tx: 0, ty: 0 }), mapRadius) })),
    cities: cityShapes.map(city => ({ ...city, ...build(fromCoordinates(alignedHubei.cities[city.id]), mapRadius, []), anchor: onSphere(new THREE.Vector2(city.label[0] * transform.sx + transform.tx, city.label[1] * transform.sy + transform.ty), 1.004) })),
    cityBorders: build([], mapRadius, alignedHubei.interior.map(path => path.map(point => new THREE.Vector2(...point)))).outlines,
    onSphere
  };
  return geometryCache;
}

export function createGlobeMap({ container, provinces, cities, transform, maritimePath, view, language, cityName, onNavigate }) {
  view.panX = 0;
  view.panY = 0;
  const canvas = container.querySelector('.globe-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, .008, 12);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const resources = [];
  const controller = new AbortController();
  const pointers = new Map();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const map = prepareMap(provinces, cities, transform);
  const register = resource => { resources.push(resource); return resource; };
  const geometry = positions => register(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)));
  const globe = new THREE.Mesh(register(new THREE.SphereGeometry(1, 128, 96)), register(new THREE.MeshPhongMaterial({ color: '#131c29', shininess: 14, specular: '#263b57' })));
  scene.add(globe);
  scene.add(new THREE.HemisphereLight('#b9cce8', '#070b14', 1.35));
  const sunlight = new THREE.DirectionalLight('#c8dcfa', 1.45);
  sunlight.position.set(-3, 5, 6);
  scene.add(sunlight);
  const graticule = [];
  for (let latitude = -75; latitude <= 75; latitude += 15) {
    for (let longitude = -180; longitude < 180; longitude += 2) {
      [longitude, longitude + 2].forEach(degrees => {
        const horizontal = THREE.MathUtils.degToRad(degrees);
        const vertical = THREE.MathUtils.degToRad(latitude);
        graticule.push(Math.sin(horizontal) * Math.cos(vertical) * 1.00015, Math.sin(vertical) * 1.00015, Math.cos(horizontal) * Math.cos(vertical) * 1.00015);
      });
    }
  }
  for (let longitude = -180; longitude < 180; longitude += 15) {
    for (let latitude = -88; latitude < 88; latitude += 2) {
      [latitude, latitude + 2].forEach(degrees => {
        const horizontal = THREE.MathUtils.degToRad(longitude);
        const vertical = THREE.MathUtils.degToRad(degrees);
        graticule.push(Math.sin(horizontal) * Math.cos(vertical) * 1.00015, Math.sin(vertical) * 1.00015, Math.cos(horizontal) * Math.cos(vertical) * 1.00015);
      });
    }
  }
  scene.add(new THREE.LineSegments(geometry(graticule), register(new THREE.LineBasicMaterial({ color: '#90afd6', transparent: true, opacity: .055 }))));
  const surroundingMesh = new THREE.Mesh(geometry(map.surroundings.positions), register(new THREE.MeshBasicMaterial({ color: '#1c2836', side: THREE.DoubleSide })));
  surroundingMesh.name = 'surrounding-land';
  scene.add(surroundingMesh);
  const coastline = new THREE.LineSegments(geometry(map.surroundings.outlines), register(new THREE.LineBasicMaterial({ color: '#536b83', transparent: true, opacity: .45 })));
  coastline.name = 'surrounding-coastline';
  scene.add(coastline);
  const landColors = ['#242d39', '#28323f', '#2c3542', '#26303c'];
  const cityColors = ['#415e80', '#3c5675', '#4b6888', '#456384', '#354e70'];
  const provinceOutline = register(new THREE.LineBasicMaterial({ color: '#576a81', transparent: true, opacity: .52 }));
  map.provinces.forEach((province, index) => {
    if (province.code === '420000') return;
    const mesh = new THREE.Mesh(geometry(province.positions), register(new THREE.MeshBasicMaterial({ color: landColors[index % landColors.length], side: THREE.DoubleSide })));
    mesh.userData.provinceCode = province.code;
    scene.add(mesh);
    scene.add(new THREE.LineSegments(geometry(province.outlines), provinceOutline));
  });
  if (maritimePath) {
    const maritime = [];
    let previous;
    for (const match of maritimePath.matchAll(/([ML])(-?[\d.]+),(-?[\d.]+)/g)) {
      const point = new THREE.Vector2(Number(match[2]), Number(match[3]));
      if (match[1] === 'L' && previous) maritime.push(...map.onSphere(previous, 1.002).toArray(), ...map.onSphere(point, 1.002).toArray());
      previous = point;
    }
    scene.add(new THREE.LineSegments(geometry(maritime), register(new THREE.LineBasicMaterial({ color: '#8297b3', transparent: true, opacity: .5 }))));
  }
  const cityOutline = register(new THREE.LineBasicMaterial({ color: '#91b6dd', transparent: true, opacity: .7 }));
  const cityMeshes = map.cities.map((city, index) => {
    const material = register(new THREE.MeshBasicMaterial({ color: cityColors[index % cityColors.length], side: THREE.DoubleSide }));
    const mesh = new THREE.Mesh(geometry(city.positions), material);
    mesh.userData = { cityId: city.id, baseColor: material.color.clone() };
    scene.add(mesh);
    return mesh;
  });
  const cityBorders = new THREE.LineSegments(geometry(map.cityBorders), cityOutline);
  cityBorders.name = 'hubei-city-borders';
  scene.add(cityBorders);
  const hubeiOutline = map.provinces.find(province => province.code === '420000');
  if (hubeiOutline) {
    const outline = new THREE.LineSegments(geometry(hubeiOutline.outlines), register(new THREE.LineBasicMaterial({ color: '#a6cefa' })));
    outline.name = 'hubei-province-border';
    scene.add(outline);
  }
  const labelsLayer = container.querySelector('.globe-labels');
  const leaders = container.querySelector('.globe-leaders');
  const provinceLabel = container.querySelector('.globe-province-label');
  const labels = map.cities.map(city => {
    const element = document.createElement('a');
    element.className = 'globe-city-label';
    element.href = `#city/${city.id}`;
    element.textContent = cityName(city);
    element.setAttribute('aria-label', `${language === 'en' ? 'Explore' : '进入'} ${cityName(city)}`);
    labelsLayer.append(element);
    const leader = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    leaders.append(leader);
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    marker.setAttribute('r', '1.7');
    leaders.append(marker);
    element.addEventListener('pointerenter', () => setHovered(city.id), { signal: controller.signal });
    element.addEventListener('pointerleave', () => setHovered(''), { signal: controller.signal });
    element.addEventListener('focus', () => setHovered(city.id), { signal: controller.signal });
    element.addEventListener('blur', () => setHovered(''), { signal: controller.signal });
    return { city, element, leader, marker, width: 0, height: 0 };
  });
  let width = 1;
  let height = 1;
  let frame = 0;
  let previousTime = 0;
  let destroyed = false;
  let gesture;
  let hoveredId = '';
  let displayedZoom = view.zoom;
  const altitude = () => {
    const framingDistance = Math.max(1.8, height / width * 2.4);
    const wideView = (framingDistance - 1.8) * Math.exp(-Math.max(0, displayedZoom - 1) * .9);
    return (1.8 + wideView) / displayedZoom;
  };
  const updateCamera = () => {
    const distance = altitude();
    camera.position.set(0, 0, 1 + distance);
    camera.quaternion.identity();
    camera.aspect = width / height;
    camera.setViewOffset(width, height, 0, -Math.min(height * .055, 42), width, height);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };
  const screenPoint = anchor => {
    const projected = anchor.clone().project(camera);
    return { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2, visible: projected.z >= -1 && projected.z <= 1 && anchor.dot(camera.position.clone().sub(anchor)) > 0 };
  };
  const overlaps = (first, second, gap = 4) => first.left < second.right + gap && first.right > second.left - gap && first.top < second.bottom + gap && first.bottom > second.top - gap;
  const layoutLabels = () => {
    const localScale = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * altitude());
    const expanded = localScale > (width < 650 ? 1800 : 2200);
    container.dataset.detail = expanded ? 'cities' : 'province';
    const center = screenPoint(new THREE.Vector3(0, 0, 1.005));
    provinceLabel.style.transform = `translate(${center.x}px, ${center.y + 20}px) translate(-50%, 0)`;
    provinceLabel.hidden = expanded;
    const viewport = container.getBoundingClientRect();
    const reserved = [...container.querySelectorAll('.map-controls, .map-style-picker')].map(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left - viewport.left, right: rect.right - viewport.left, top: rect.top - viewport.top, bottom: rect.bottom - viewport.top };
    });
    const sorted = [...labels].sort((first, second) => first.city.id.localeCompare(second.city.id));
    sorted.forEach(label => {
      const point = screenPoint(label.city.anchor);
      const visible = expanded && point.visible && point.x > -30 && point.x < width + 30 && point.y > 60 && point.y < height + 30;
      label.element.hidden = !visible;
      label.leader.style.display = visible ? '' : 'none';
      label.marker.style.display = visible ? '' : 'none';
      if (!visible) return;
      label.marker.setAttribute('cx', point.x.toFixed(2));
      label.marker.setAttribute('cy', point.y.toFixed(2));
      const labelWidth = label.width;
      const labelHeight = label.height;
      let best;
      for (const radius of [10, 23, 39, 58, 80, 108]) {
        for (const direction of [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]]) {
          const left = point.x + direction[0] * radius - (direction[0] < 0 ? labelWidth : direction[0] === 0 ? labelWidth / 2 : 0);
          const top = point.y + direction[1] * radius - labelHeight / 2;
          const candidate = { left, top, right: left + labelWidth, bottom: top + labelHeight };
          const overflow = Math.max(0, 10 - left) + Math.max(0, candidate.right - width + 10) + Math.max(0, 95 - top) + Math.max(0, candidate.bottom - height + 12);
          const score = reserved.reduce((total, rect) => total + (overlaps(candidate, rect) ? 10000 : 0), 0) + overflow * 500 + radius;
          if (!best || score < best.score) best = { ...candidate, score };
        }
        if (best.score < 100) break;
      }
      reserved.push(best);
      label.element.style.transform = `translate(${best.left}px, ${best.top}px)`;
      const anchorX = Math.max(best.left, Math.min(best.right, point.x));
      const anchorY = Math.max(best.top, Math.min(best.bottom, point.y));
      label.leader.setAttribute('d', `M${point.x.toFixed(2)},${point.y.toFixed(2)}L${anchorX.toFixed(2)},${anchorY.toFixed(2)}`);
    });
  };
  const renderFrame = time => {
    frame = 0;
    if (destroyed) return;
    const blend = reducedMotion.matches ? 1 : 1 - Math.exp(-Math.min(64, time - previousTime || 16) / 105);
    previousTime = time;
    displayedZoom += (view.zoom - displayedZoom) * blend;
    const moving = Math.abs(view.zoom - displayedZoom) > .0001;
    if (!moving) displayedZoom = view.zoom;
    updateCamera();
    renderer.render(scene, camera);
    layoutLabels();
    container.querySelector('.map-zoom-level').value = `${Math.round(view.zoom * 100)}%`;
    container.querySelector('[data-map-control="out"]').disabled = view.zoom <= minimumZoom;
    container.querySelector('[data-map-control="in"]').disabled = view.zoom >= maximumZoom;
    if (moving) requestDraw();
  };
  const requestDraw = () => { if (!destroyed && !frame) frame = requestAnimationFrame(renderFrame); };
  function setHovered(cityId) {
    if (hoveredId === cityId) return;
    hoveredId = cityId;
    cityMeshes.forEach(mesh => mesh.material.color.copy(mesh.userData.baseColor).lerp(new THREE.Color('#8cb5e4'), mesh.userData.cityId === cityId ? .65 : 0));
    labels.forEach(label => label.element.classList.toggle('is-hovered', label.city.id === cityId));
    canvas.style.cursor = cityId ? 'pointer' : 'default';
    requestDraw();
  }
  const hitCity = event => {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(cityMeshes, false)[0]?.object.userData.cityId || '';
  };
  const zoomBy = factor => {
    view.zoom = THREE.MathUtils.clamp(view.zoom * factor, minimumZoom, maximumZoom);
    view.panX = 0;
    view.panY = 0;
    setHovered('');
    requestDraw();
  };
  const reset = () => { view.zoom = defaultZoom; view.panX = 0; view.panY = 0; requestDraw(); };
  const resize = () => {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    labels.forEach(label => {
      label.element.hidden = false;
      label.width = label.element.offsetWidth;
      label.height = label.element.offsetHeight;
    });
    requestDraw();
  };
  canvas.addEventListener('wheel', event => { event.preventDefault(); zoomBy(Math.exp(-event.deltaY * .0015)); }, { passive: false, signal: controller.signal });
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) gesture = { kind: 'tap', startX: event.clientX, startY: event.clientY, cityId: hitCity(event), moved: false };
    else if (pointers.size === 2) {
      const [first, second] = [...pointers.values()];
      gesture = { kind: 'pinch', distance: Math.hypot(first.x - second.x, first.y - second.y) || 1, zoom: view.zoom, moved: true };
    }
  }, { signal: controller.signal });
  canvas.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) { setHovered(hitCity(event)); return; }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture?.kind === 'pinch' && pointers.size >= 2) {
      const [first, second] = [...pointers.values()];
      view.zoom = THREE.MathUtils.clamp(gesture.zoom * Math.hypot(first.x - second.x, first.y - second.y) / gesture.distance, minimumZoom, maximumZoom);
      view.panX = 0;
      view.panY = 0;
    } else if (gesture?.kind === 'tap') {
      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      if (Math.hypot(deltaX, deltaY) > 5) gesture.moved = true;
    }
    setHovered('');
    requestDraw();
  }, { signal: controller.signal });
  const finishPointer = event => {
    if (!pointers.has(event.pointerId)) return;
    const cityId = event.type === 'pointerup' && gesture?.kind === 'tap' && !gesture.moved ? gesture.cityId : '';
    pointers.delete(event.pointerId);
    if (pointers.size === 1) {
      const remaining = [...pointers.values()][0];
      gesture = { kind: 'tap', startX: remaining.x, startY: remaining.y, moved: true };
    } else if (!pointers.size) gesture = null;
    if (cityId) onNavigate(cityId);
  };
  canvas.addEventListener('pointerup', finishPointer, { signal: controller.signal });
  canvas.addEventListener('pointercancel', finishPointer, { signal: controller.signal });
  canvas.addEventListener('pointerleave', () => setHovered(''), { signal: controller.signal });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    container.querySelector('.globe-status').hidden = false;
    container.querySelector('.globe-status').textContent = language === 'en' ? 'Graphics paused. Reload or choose Style 1.' : '图形显示已暂停，请刷新或切换样式一。';
  }, { signal: controller.signal });
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  document.fonts?.ready.then(() => { if (!destroyed) resize(); });
  container.querySelector('.globe-status').hidden = true;
  resize();
  return {
    zoomBy, reset,
    destroy() {
      destroyed = true;
      controller.abort();
      resizeObserver.disconnect();
      cancelAnimationFrame(frame);
      resources.forEach(resource => resource.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      labelsLayer.replaceChildren();
      leaders.replaceChildren();
    }
  };
}
