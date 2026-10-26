const auroraPlanetTextures = new Map();

function createAuroraStarRenderer(context, groups) {
  const palettes = [
    { light: [203, 255, 255], mid: [58, 190, 230], dark: [28, 74, 157], glow: '#73e6ff', ring: false },
    { light: [238, 225, 255], mid: [163, 143, 241], dark: [71, 49, 142], glow: '#c9b1ff', ring: true },
    { light: [255, 245, 198], mid: [244, 163, 113], dark: [167, 64, 101], glow: '#ffc99c', ring: true },
    { light: [227, 255, 205], mid: [113, 220, 176], dark: [29, 109, 127], glow: '#a2ffcf', ring: false },
    { light: [255, 228, 252], mid: [238, 142, 203], dark: [124, 53, 149], glow: '#ffaee7', ring: false },
    { light: [229, 251, 255], mid: [131, 160, 250], dark: [55, 62, 157], glow: '#b4c5ff', ring: true },
    { light: [255, 247, 229], mid: [246, 173, 174], dark: [153, 76, 128], glow: '#ffd3ce', ring: false },
    { light: [255, 254, 207], mid: [229, 198, 128], dark: [146, 105, 73], glow: '#ffdf98', ring: false }
  ];
  const positions = [
    [-.32, -.015, -.51], [-.19, .235, 1], [.065, .295, .23], [.31, .175, .85],
    [.35, -.135, -.8], [.15, -.275, .81], [-.055, -.265, -.9], [-.185, -.12, .82]
  ];
  const mobilePositions = [
    [-.255, -.17, -.99], [.245, -.12, .95], [-.235, .06, -.23], [.235, .11, .51],
    [-.245, .29, -.71], [.235, -.35, .1], [-.245, -.40, -.56], [.235, .34, .65]
  ];
  let hoveredKey = '';
  let lastTime = 0;
  const emphasis = new Map();
  const fontFamily = 'Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  const rgba = (hex, alpha) => {
    const value = parseInt(hex.slice(1), 16);
    return `rgba(${value >> 16 & 255},${value >> 8 & 255},${value & 255},${alpha})`;
  };
  const blend = (first, second, amount) => first.map((channel, index) => channel + (second[index] - channel) * amount);
  const inverseDefault = ({ x, y, z }) => {
    const yaw = -.32;
    const pitch = .18;
    const rotatedDepth = z * Math.cos(pitch) - y * Math.sin(pitch);
    return {
      x: x * Math.cos(yaw) + rotatedDepth * Math.sin(yaw),
      y: y * Math.cos(pitch) + z * Math.sin(pitch),
      z: -x * Math.sin(yaw) + rotatedDepth * Math.cos(yaw)
    };
  };
  const textureFor = index => {
    const paletteIndex = index % palettes.length;
    if (auroraPlanetTextures.has(paletteIndex)) return auroraPlanetTextures.get(paletteIndex);
    const palette = palettes[paletteIndex];
    const texture = document.createElement('canvas');
    const size = 192;
    texture.width = size;
    texture.height = size;
    const painter = texture.getContext('2d');
    const image = painter.createImageData(size, size);
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        const normalX = (column + .5 - size / 2) / (size / 2);
        const normalY = (row + .5 - size / 2) / (size / 2);
        const distance = normalX * normalX + normalY * normalY;
        if (distance > 1) continue;
        const normalZ = Math.sqrt(1 - distance);
        const latitude = Math.asin(normalY);
        const longitude = Math.atan2(normalX, normalZ);
        const turbulence = Math.sin(longitude * 5 + latitude * 7 + paletteIndex) * .11
          + Math.sin(longitude * 11 - latitude * 4) * .045
          + Math.sin(longitude * 23 + latitude * 17) * .015;
        const bands = .5 + .5 * Math.sin(latitude * (paletteIndex % 2 ? 24 : 15) + turbulence * 3 + paletteIndex);
        const clouds = .5 + .5 * Math.sin(longitude * 3 + Math.sin(latitude * 4 + paletteIndex) * 2.5 + turbulence * 5);
        const fineBands = .5 + .5 * Math.sin(latitude * 77 + turbulence * 5);
        const surface = paletteIndex % 3 === 0 ? clouds * .75 + bands * .25
          : paletteIndex % 3 === 1 ? bands * .58 + fineBands * .12 + clouds * .3
          : clouds * .45 + bands * .45 + fineBands * .1;
        const pattern = .25 + surface * .65;
        const base = pattern < .48
          ? blend(palette.dark, palette.mid, pattern / .48)
          : blend(palette.mid, palette.light, (pattern - .48) / .52);
        const diffuse = Math.max(0, -normalX * .46 - normalY * .54 + normalZ * .7);
        const light = .28 + diffuse * .78;
        const rim = Math.pow(1 - normalZ, 4) * .25;
        const highlight = Math.pow(Math.max(0, -normalX * .3 - normalY * .38 + normalZ * .875), 24) * 28;
        const pixelIndex = (row * size + column) * 4;
        for (let channel = 0; channel < 3; channel++) {
          image.data[pixelIndex + channel] = Math.min(255, base[channel] * light + palette.light[channel] * rim + highlight);
        }
        image.data[pixelIndex + 3] = Math.min(1, (1 - Math.sqrt(distance)) * size / 2) * 255;
      }
    }
    painter.putImageData(image, 0, 0);
    auroraPlanetTextures.set(paletteIndex, texture);
    return texture;
  };
  const glow = (painter, centerX, centerY, radius, color, opacity) => {
    const gradient = painter.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, rgba(color, opacity));
    gradient.addColorStop(.24, rgba(color, opacity * .48));
    gradient.addColorStop(1, rgba(color, 0));
    painter.fillStyle = gradient;
    painter.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
  };
  const drawLightRibbons = (width, height, time) => {
    const centerX = width * .53;
    const centerY = height * .54;
    const radius = Math.min(width * .45, height * .66);
    context.save();
    context.translate(centerX, centerY);
    context.rotate(-.35);
    for (let index = 0; index < 4; index++) {
      const laneRadius = radius * (.58 + index * .19);
      context.beginPath();
      context.ellipse(0, 0, laneRadius, laneRadius * .38, 0, 0, Math.PI * 2);
      context.strokeStyle = index % 2 ? '#cfc0ff21' : '#9be9ff24';
      context.lineWidth = 1;
      context.stroke();
      const angle = time * .00013 * (index % 2 ? -1 : 1) + index * 1.7;
      for (let trail = 0; trail < 24; trail++) {
        const start = angle - trail * .026;
        context.beginPath();
        context.ellipse(0, 0, laneRadius, laneRadius * .38, 0, start, start + .035);
        context.strokeStyle = rgba(index % 2 ? '#e6c4ff' : '#aff6ff', (1 - trail / 24) * .73);
        context.lineWidth = 1.4 + (1 - trail / 24) * 1.7;
        context.stroke();
      }
    }
    context.restore();
    const coreRadius = Math.min(width * .075, height * .13, 94);
    glow(context, centerX, centerY, coreRadius * 2.3, '#a6c9ff', .16 + Math.sin(time * .001) * .035);
    context.save();
    context.translate(centerX, centerY);
    context.rotate(-.35);
    for (let index = 0; index < 3; index++) {
      context.beginPath();
      context.ellipse(0, 0, coreRadius * (1 + index * .13), coreRadius * (.42 + index * .045), 0, 0, Math.PI * 2);
      context.strokeStyle = rgba(index === 1 ? '#eee1ff' : '#a4e6ff', .15 - index * .03);
      context.lineWidth = index === 1 ? 2 : .8;
      context.stroke();
    }
    context.restore();
    for (let index = 0; index < 2; index++) {
      const progress = (time * .000045 + index * .51) % 1;
      const opacity = Math.pow(Math.sin(progress * Math.PI), 6) * .7;
      const headX = width * (1.1 - progress * 1.3);
      const headY = height * (.08 + progress * .65 + index * .12);
      const trailLength = Math.min(width * .14, 170);
      const gradient = context.createLinearGradient(headX, headY, headX + trailLength, headY - trailLength * .32);
      gradient.addColorStop(0, `rgba(234,251,255,${opacity})`);
      gradient.addColorStop(1, 'rgba(168,202,255,0)');
      context.beginPath();
      context.moveTo(headX, headY);
      context.lineTo(headX + trailLength, headY - trailLength * .32);
      context.strokeStyle = gradient;
      context.lineWidth = 1.2;
      context.stroke();
    }
  };
  const orbitPoint = (center, angle, radius, tilt, view) => {
    const screenX = Math.cos(angle + tilt) * radius;
    const screenY = Math.sin(angle + tilt) * radius;
    const yawCosine = Math.cos(view.yaw);
    const yawSine = Math.sin(view.yaw);
    const pitchCosine = Math.cos(view.pitch);
    const pitchSine = Math.sin(view.pitch);
    return {
      x: center.x + screenX * yawCosine - screenY * pitchSine * yawSine,
      y: center.y + screenY * pitchCosine,
      z: center.z - screenX * yawSine - screenY * pitchSine * yawCosine
    };
  };
  const drawPlanetRing = (node, front) => {
    const { x, y } = node.point;
    context.save();
    context.translate(x, y);
    context.rotate(-.4 + node.index * .045);
    for (let stripe = 0; stripe < 5; stripe++) {
      context.beginPath();
      context.ellipse(0, 0, node.radius * (1.49 + stripe * .085), node.radius * (.37 + stripe * .025), 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
      context.strokeStyle = rgba(node.palette.glow, (front ? .55 : .27) - stripe * .04);
      context.lineWidth = stripe % 2 ? 1.2 : 2;
      context.stroke();
    }
    context.restore();
  };
  const drawPrimary = (node, time, selected) => {
    const { x, y } = node.point;
    const amount = emphasis.get(node.group.industryId) || 0;
    const radius = node.radius;
    glow(context, x, y, radius * (2.8 + amount * .5), node.palette.glow, .24 + amount * .14);
    if (node.palette.ring) drawPlanetRing(node, false);
    context.save();
    context.translate(x, y);
    context.rotate(Math.sin(time * .00015 + node.index) * .045);
    context.drawImage(textureFor(node.index), -radius, -radius, radius * 2, radius * 2);
    context.restore();
    context.beginPath();
    context.arc(x, y, radius + .7, 0, Math.PI * 2);
    context.strokeStyle = rgba(node.palette.glow, .7);
    context.lineWidth = 1.2;
    context.stroke();
    if (node.palette.ring) drawPlanetRing(node, true);
    if (selected || amount > .05) {
      context.save();
      context.setLineDash([2, 5]);
      context.lineDashOffset = -time * .012;
      context.beginPath();
      context.arc(x, y, radius + 9, 0, Math.PI * 2);
      context.strokeStyle = rgba('#ecf8ff', selected ? .63 : amount * .45);
      context.lineWidth = .8;
      context.stroke();
      context.restore();
    }
  };
  const wrapLabel = (text, maxWidth) => {
    if (context.measureText(text).width <= maxWidth) return [text];
    const words = text.includes(' ') ? text.split(' ') : [...text];
    const separator = text.includes(' ') ? ' ' : '';
    const lines = [];
    let line = '';
    words.forEach(word => {
      const candidate = line ? line + separator + word : word;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = candidate;
    });
    if (line) lines.push(line);
    return lines;
  };
  const overlap = (first, second, gap = 4) => first.left < second.right + gap
    && first.right > second.left - gap && first.top < second.bottom + gap && first.bottom > second.top - gap;
  const drawLabels = (nodes, width, height, language, view) => {
    const mobile = width <= 720;
    const reserved = [];
    const primaryNodes = nodes.filter(node => node.type === 'primary');
    const bodyBounds = nodes.map(node => ({
      left: node.point.x - node.radius, right: node.point.x + node.radius,
      top: node.point.y - node.radius, bottom: node.point.y + node.radius
    }));
    const fontSize = mobile ? 13 : 16;
    const lineHeight = mobile ? 17 : 21;
    primaryNodes.sort((first, second) => Number(second.group.industryId === view.selectedId) - Number(first.group.industryId === view.selectedId));
    for (const node of primaryNodes) {
      context.font = `700 ${fontSize}px ${fontFamily}`;
      const name = language === 'en' ? node.group.nameEn : node.group.name;
      const maxLabelWidth = mobile ? Math.min(144, width * .39) : 186;
      let lines = wrapLabel(name, maxLabelWidth);
      if (mobile && language !== 'en' && lines.length > 1) {
        const characters = [...name];
        const charactersPerLine = Math.ceil(characters.length / lines.length);
        const balancedLines = [];
        for (let offset = 0; offset < characters.length; offset += charactersPerLine) {
          balancedLines.push(characters.slice(offset, offset + charactersPerLine).join(''));
        }
        if (balancedLines.every(line => context.measureText(line).width <= maxLabelWidth)) lines = balancedLines;
      }
      const labelWidth = Math.max(...lines.map(line => context.measureText(line).width)) + 10;
      const labelHeight = lines.length * lineHeight + 6;
      const candidates = mobile ? [node.point.y + Math.max(node.radius + 13, node.orbitExtent + 10)] : [
        node.point.y + node.radius + 13,
        node.point.y - node.radius - labelHeight - 13,
        node.point.y + node.orbitExtent + 13,
        node.point.y - node.orbitExtent - labelHeight - 13
      ];
      const candidateBounds = candidates.map(top => ({
        left: Math.max(5, Math.min(width - labelWidth - 5, node.point.x - labelWidth / 2)),
        right: Math.max(5, Math.min(width - labelWidth - 5, node.point.x - labelWidth / 2)) + labelWidth,
        top, bottom: top + labelHeight
      }));
      const bounds = candidateBounds.find(candidate => candidate.top > 72 && candidate.bottom < height - 40
        && !reserved.some(rect => overlap(candidate, rect)) && !bodyBounds.some(rect => overlap(candidate, rect, 1)))
        || candidateBounds.find(candidate => !reserved.some(rect => overlap(candidate, rect))) || candidateBounds[0];
      reserved.push(bounds);
      const selected = node.group.industryId === view.selectedId;
      context.save();
      context.shadowColor = '#112b4fe6';
      context.shadowBlur = selected ? 9 : 6;
      context.shadowOffsetY = 1;
      context.textAlign = 'center';
      context.textBaseline = 'top';
      context.fillStyle = node.palette.glow;
      lines.forEach((line, index) => context.fillText(line, (bounds.left + bounds.right) / 2, bounds.top + 3 + index * lineHeight));
      context.restore();
    }
    const satellites = nodes.filter(node => node.type === 'satellite');
    satellites.sort((first, second) => Number(second.satellite[0] === view.selectedSatellite) - Number(first.satellite[0] === view.selectedSatellite)
      || first.index - second.index || first.group.satellites.indexOf(first.satellite) - second.group.satellites.indexOf(second.satellite));
    for (const node of satellites) {
      const name = node.satellite[language === 'en' ? 2 : 1];
      const selected = node.satellite[0] === view.selectedSatellite;
      context.font = `${selected ? '600' : '400'} ${mobile ? 10 : 11}px ${fontFamily}`;
      const lines = wrapLabel(name, mobile ? 110 : 150);
      const labelWidth = Math.max(...lines.map(line => context.measureText(line).width)) + 8;
      const labelHeight = lines.length * 14 + 4;
      const offset = node.radius + 9;
      const candidates = [0, 18, 36, 60, 90, 125].flatMap(extra => {
        const spacing = offset + extra;
        return [
          { left: node.point.x + spacing, top: node.point.y - labelHeight / 2 },
          { left: node.point.x - spacing - labelWidth, top: node.point.y - labelHeight / 2 },
          { left: node.point.x - labelWidth / 2, top: node.point.y - spacing - labelHeight },
          { left: node.point.x - labelWidth / 2, top: node.point.y + spacing },
          { left: node.point.x + spacing, top: node.point.y - spacing - labelHeight },
          { left: node.point.x - spacing - labelWidth, top: node.point.y - spacing - labelHeight },
          { left: node.point.x + spacing, top: node.point.y + spacing },
          { left: node.point.x - spacing - labelWidth, top: node.point.y + spacing }
        ];
      }).map(candidate => ({ ...candidate, right: candidate.left + labelWidth, bottom: candidate.top + labelHeight }));
      const insideViewport = candidate => candidate.left >= 6 && candidate.right <= width - 6
        && candidate.top >= 70 && candidate.bottom <= height - 12;
      const clearBounds = candidate => !reserved.some(rect => overlap(candidate, rect, 2))
        && !bodyBounds.some(rect => overlap(candidate, rect, 2));
      let bounds = candidates.find(candidate => insideViewport(candidate) && clearBounds(candidate));
      if (!bounds) {
        const fallbackCandidates = [];
        let nearestClearDistance = Infinity;
        const nearestDistance = candidate => Math.hypot(
          Math.max(candidate.left, Math.min(candidate.right, node.point.x)) - node.point.x,
          Math.max(candidate.top, Math.min(candidate.bottom, node.point.y)) - node.point.y
        );
        for (let top = 70; top <= height - labelHeight - 12; top += Math.max(12, labelHeight / 2)) {
          for (let left = 6; left <= width - labelWidth - 6; left += Math.max(16, labelWidth / 3)) {
            const candidate = { left, right: left + labelWidth, top, bottom: top + labelHeight };
            const distance = nearestDistance(candidate);
            fallbackCandidates.push({ candidate, distance });
            if (distance < nearestClearDistance && clearBounds(candidate)) {
              bounds = candidate;
              nearestClearDistance = distance;
            }
          }
        }
        if (!bounds) {
          const overlapArea = (first, second) => Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left))
            * Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
          let lowestPenalty = Infinity;
          for (const { candidate, distance } of fallbackCandidates) {
            const penalty = reserved.reduce((total, rect) => total + overlapArea(candidate, rect) * 4, 0)
              + bodyBounds.reduce((total, rect) => total + overlapArea(candidate, rect) * 2, 0) + distance * .05;
            if (penalty < lowestPenalty) {
              bounds = candidate;
              lowestPenalty = penalty;
            }
          }
        }
        if (!bounds) {
          const left = Math.max(6, Math.min(width - labelWidth - 6, node.point.x - labelWidth / 2));
          const top = Math.max(6, Math.min(height - labelHeight - 6, node.point.y + offset));
          bounds = { left, right: left + labelWidth, top, bottom: top + labelHeight };
        }
      }
      reserved.push(bounds);
      const anchorX = Math.max(bounds.left, Math.min(bounds.right, node.point.x));
      const anchorY = Math.max(bounds.top, Math.min(bounds.bottom, node.point.y));
      const anchorDistance = Math.hypot(anchorX - node.point.x, anchorY - node.point.y) || 1;
      const lineStart = (node.radius + 3) / anchorDistance;
      context.save();
      context.beginPath();
      context.moveTo(node.point.x + (anchorX - node.point.x) * lineStart, node.point.y + (anchorY - node.point.y) * lineStart);
      context.lineTo(anchorX, anchorY);
      context.strokeStyle = rgba(node.palette.glow, selected ? .8 : .32);
      context.lineWidth = .8;
      context.stroke();
      context.textAlign = 'left';
      context.textBaseline = 'top';
      context.shadowColor = '#102a4fe6';
      context.shadowBlur = 5;
      context.shadowOffsetY = 1;
      context.fillStyle = selected ? '#ffffff' : '#d2e3f5';
      lines.forEach((line, index) => context.fillText(line, bounds.left + 4, bounds.top + 2 + index * 14));
      context.restore();
    }
    context.textBaseline = 'alphabetic';
  };
  const draw = ({ width, height, time, project, view, language, drawBackground, focalLength = 1000 }) => {
    const mobile = width <= 720;
    context.clearRect(0, 0, width, height);
    context.save();
    drawBackground?.(time);
    drawLightRibbons(width, height, time);
    const nodes = [];
    const radius = mobile ? Math.min(22, width * .053, height * .039) : Math.min(36, width * .027, height * .048);
    const layoutHeight = mobile ? Math.max(250, height - 112) : height;
    const depthSpan = Math.min(width * .3, height * .5);
    const orbitRadius = radius * (mobile ? 2.2 : 2.35);
    const layouts = groups.map((group, index) => {
      const position = (mobile ? mobilePositions : positions)[index]
        || [Math.cos(index * 2.4) * .32, Math.sin(index * 2.4) * .28, Math.sin(index * 1.7) * .9];
      const depth = position[2] * depthSpan;
      const perspective = focalLength / (focalLength + depth);
      const center = inverseDefault({
        x: position[0] * width / perspective,
        y: (position[1] * layoutHeight + height * (mobile ? .015 : .055)) / perspective,
        z: depth
      });
      const tilt = -.35 + index * .17;
      const satellites = group.satellites.map((satellite, satelliteIndex) => {
        const angle = satelliteIndex * Math.PI * 2 / group.satellites.length - .7 + index * .34;
        return { satellite, position: orbitPoint(center, angle, orbitRadius, tilt, view) };
      });
      return { group, index, center, tilt, satellites };
    });
    const framingPoints = layouts.flatMap(layout => [
      { point: project(layout.center), padding: radius * 1.3 },
      ...layout.satellites.map(satellite => ({ point: project(satellite.position), padding: radius * .2 }))
    ]);
    const extentX = Math.max(1, ...framingPoints.map(({ point, padding }) => Math.abs((point.x - width / 2) / view.zoom) + padding * point.scale));
    const extentY = Math.max(1, ...framingPoints.map(({ point, padding }) => Math.abs((point.y - height / 2) / view.zoom) + padding * point.scale));
    const frameScale = Math.min(1, Math.max(36, width / 2 - 24) / extentX, Math.max(36, height / 2 - 64) / extentY);
    const projectScene = position => {
      const point = project(position);
      return {
        ...point,
        x: width / 2 + (point.x - width / 2) * frameScale,
        y: height / 2 + (point.y - height / 2) * frameScale,
        scale: point.scale * frameScale
      };
    };
    const step = lastTime && time > lastTime ? Math.min(1, (time - lastTime) / 120) : 1;
    lastTime = time;
    layouts.forEach(({ group, index, center, tilt, satellites }) => {
      const palette = palettes[index % palettes.length];
      const point = projectScene(center);
      const selected = view.selectedId === group.industryId;
      const targetEmphasis = selected || hoveredKey === group.industryId ? 1 : 0;
      const previousEmphasis = emphasis.get(group.industryId) || 0;
      const amount = previousEmphasis + (targetEmphasis - previousEmphasis) * step;
      emphasis.set(group.industryId, amount);
      const primaryRadius = radius * (index === 5 ? 1.17 : index === 2 ? 1.08 : 1) * point.scale * Math.sqrt(view.zoom) * (1 + amount * .07);
      const primary = { type: 'primary', group, point, radius: primaryRadius, hitRadius: primaryRadius + 8, orbitExtent: orbitRadius * point.scale * view.zoom, palette, index };
      context.beginPath();
      for (let segment = 0; segment <= 64; segment++) {
        const orbit = projectScene(orbitPoint(center, segment / 64 * Math.PI * 2, orbitRadius, tilt, view));
        if (!segment) context.moveTo(orbit.x, orbit.y); else context.lineTo(orbit.x, orbit.y);
      }
      context.strokeStyle = rgba(palette.glow, selected ? .4 : .19);
      context.lineWidth = .8;
      context.stroke();
      const start = time * .00035 + index * 1.2;
      context.beginPath();
      for (let segment = 0; segment <= 12; segment++) {
        const orbit = projectScene(orbitPoint(center, start + segment * .035, orbitRadius, tilt, view));
        if (!segment) context.moveTo(orbit.x, orbit.y); else context.lineTo(orbit.x, orbit.y);
      }
      context.strokeStyle = rgba(palette.glow, selected ? .9 : .55);
      context.lineWidth = selected ? 2.2 : 1.4;
      context.stroke();
      nodes.push(primary);
      satellites.forEach(({ satellite, position }) => {
        const satellitePoint = projectScene(position);
        const satelliteRadius = Math.max(3.5, radius * .15 * satellitePoint.scale * Math.sqrt(view.zoom));
        nodes.push({ type: 'satellite', group, satellite, point: satellitePoint, radius: satelliteRadius, hitRadius: Math.max(15, satelliteRadius + 8), palette, index });
      });
    });
    nodes.sort((first, second) => second.point.depth - first.point.depth);
    for (const node of nodes) {
      const selected = node.group.industryId === view.selectedId;
      if (node.type === 'primary') drawPrimary(node, time, selected);
      else {
        const active = selected && node.satellite[0] === view.selectedSatellite;
        const hovered = hoveredKey === node.satellite[0];
        glow(context, node.point.x, node.point.y, node.radius * (active ? 4 : 3), node.palette.glow, active || hovered ? .8 : .35);
        const fill = context.createRadialGradient(node.point.x - node.radius * .3, node.point.y - node.radius * .4, 0, node.point.x, node.point.y, node.radius);
        fill.addColorStop(0, '#ffffff');
        fill.addColorStop(.4, node.palette.glow);
        fill.addColorStop(1, rgba(node.palette.glow, .48));
        context.beginPath();
        context.arc(node.point.x, node.point.y, node.radius * (active ? 1.25 : 1), 0, Math.PI * 2);
        context.fillStyle = fill;
        context.fill();
        if (active) {
          context.beginPath();
          context.arc(node.point.x, node.point.y, node.radius + 5, 0, Math.PI * 2);
          context.strokeStyle = '#edfcffba';
          context.lineWidth = 1;
          context.stroke();
        }
      }
    }
    drawLabels(nodes, width, height, language, view);
    context.restore();
    return nodes;
  };
  return {
    draw,
    setHovered(node) {
      hoveredKey = node?.type === 'satellite' ? node.satellite[0] : node?.group.industryId || '';
    }
  };
}
