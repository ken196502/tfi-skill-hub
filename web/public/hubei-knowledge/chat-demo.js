const chatDemoScript = [
  {
    question: '湖北光通信产业的上游主要涉及哪些核心环节？',
    thinkingSteps: ['识别问题主题：湖北光通信产业的上游环节。', '整理内容范围：原材料、光芯片与光器件。', '组织回答结构：按核心环节介绍相关企业。'],
    thinkingStepsEn: ['Identifying the topic: upstream optical communications in Hubei.', 'Organizing the scope: materials, optical chips and components.', 'Structuring the answer by segment and relevant companies.'],
    answer: '湖北光通信产业的上游主要涉及原材料、光器件和光芯片等核心零部件的研发与制造。在原材料方面，菲利华具备石英纤维批量生产能力，为光通信产业提供基础材料；在光芯片方面，云岭光电聚焦高端光芯片研发，已实现2.5G、10G、25G全系列激光器和探测器光芯片的规模化量产；在光器件方面，光迅科技具有较强的市场竞争力。这些企业和相关科研机构共同推动了湖北光通信核心零部件的技术创新与国产化进程。'
  },
  {
    question: '湖北在半导体材料领域针对“卡脖子”问题取得了哪些重点突破？',
    thinkingSteps: ['识别问题主题：半导体材料的关键技术突破。', '整理内容范围：光刻胶、CMP材料、先进封装与电子特气。', '组织回答结构：分领域概述相关企业与技术进展。'],
    thinkingStepsEn: ['Identifying the topic: key advances in semiconductor materials.', 'Organizing the scope: photoresists, CMP, packaging and specialty gases.', 'Structuring the answer by field, company and technical development.'],
    answer: [
      '湖北在光刻胶、CMP抛光材料、先进封装材料和电子特气等领域取得了一系列突破：',
      '光刻胶方面：武汉太紫微光电科技有限公司攻克了合成光刻胶的原料与配方难题，研发出T150A光刻胶，实现了配方全自主设计，并已通过半导体工艺量产验证。',
      'CMP抛光材料方面：鼎龙股份实现了抛光液核心原材料研磨粒子的自主制备，打破了国外供应商的限制；其子公司鼎汇微电子的CMP抛光垫已覆盖国内所有主流晶圆厂供应链，改变了该领域长期依赖进口的局面。',
      '先进封装材料方面：湖北三选科技成为国内唯一实现FOWLP用LMC材料自主供应的企业，打破了日本技术封锁；晶丰电子则在晶圆UV膜领域突破国际技术壁垒，实现向国内头部封测企业批量供货。',
      '电子特气方面：荆州太和气体实现高纯氯、乙硼烷量产，产品纯度达到99.9999%，打破了日本关东化学的垄断，并向台积电、三星西安等国内外知名厂商供货。'
    ].join('\n\n')
  }
];

let activeChatDemo = null;
let chatDemoSequence = 0;

function chatDemoLabel(chinese, english) {
  return language === 'en' ? english : chinese;
}

function renderChatDemoPrompt() {
  return `<button type="button" data-chat-demo data-preserve-text>${escapeText(chatDemoScript[0].question)}</button>`;
}

function renderChatDemoReply(demo) {
  if (demo.state === 'thinking') {
    const steps = demo.thinking.map((text, index) => `<li class="${index === demo.thinking.length - 1 ? 'is-current' : 'is-complete'}"><span class="chat-demo-step-marker" aria-hidden="true">${index === demo.thinking.length - 1 ? '·' : '✓'}</span><span>${escapeText(text)}</span></li>`).join('');
    return `<div class="chat-demo-thinking-process"><div class="chat-demo-thinking"><span class="chat-demo-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${chatDemoLabel('正在思考…', 'Thinking…')}</span></div><ol class="chat-demo-thinking-steps">${steps}</ol></div>`;
  }
  const paragraphs = demo.text.split('\n\n').filter(Boolean).map(paragraph => `<p>${escapeText(paragraph)}</p>`).join('');
  const interrupted = demo.state === 'stopped' ? `<small class="reply-note">${chatDemoLabel('回复已中止', 'Response interrupted')}</small>` : '';
  return `<div class="chat-demo-answer ${demo.state === 'answering' ? 'is-streaming' : ''}">${paragraphs}</div>${interrupted}`;
}

function renderChatDemoExchange(exchange) {
  const demo = exchange.demo;
  const busy = ['thinking', 'answering'].includes(demo.state);
  return `<div class="chat-row user-row"><div class="chat-stack"><div class="chat-bubble" data-preserve-text>${escapeText(exchange.question)}</div></div><span class="chat-avatar user-avatar">${chatDemoLabel('我', 'ME')}</span></div><div class="chat-row assistant-row"><span class="chat-avatar">✦</span><div class="chat-stack"><div class="chat-bubble assistant-bubble chat-demo-bubble" data-demo-reply="${demo.id}" data-preserve-text aria-busy="${busy}">${renderChatDemoReply(demo)}</div></div></div>`;
}

function updateChatDemoReply(exchange) {
  const messages = document.querySelector('#chatMessages');
  const bubble = document.querySelector(`[data-demo-reply="${exchange.demo.id}"]`);
  if (!messages || !bubble) return;
  const follow = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 64;
  bubble.innerHTML = renderChatDemoReply(exchange.demo);
  bubble.setAttribute('aria-busy', String(['thinking', 'answering'].includes(exchange.demo.state)));
  if (follow) messages.scrollTop = messages.scrollHeight;
}

function setChatDemoPhase(run, phase) {
  if (activeChatDemo !== run) return;
  run.phase = phase;
  const form = document.querySelector('#askForm');
  if (form) form.dataset.demoPhase = phase;
}

function waitForChatDemo(run, duration) {
  return new Promise((resolve, reject) => {
    const signal = run.controller.signal;
    if (signal.aborted) { reject(new DOMException('Demo stopped', 'AbortError')); return; }
    const cancel = () => {
      clearTimeout(timer);
      reject(new DOMException('Demo stopped', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, duration);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

function finishChatDemo(run, stopped) {
  if (activeChatDemo !== run) return;
  run.controller.abort();
  const exchange = run.exchange;
  if (stopped && exchange && ['thinking', 'answering'].includes(exchange.demo.state)) {
    exchange.demo.state = 'stopped';
    updateChatDemoReply(exchange);
  }
  activeChatDemo = null;
  const input = document.querySelector('#questionInput');
  const form = document.querySelector('#askForm');
  const messages = document.querySelector('#chatMessages');
  if (input) {
    if (['typing', 'sending'].includes(run.phase)) input.value = '';
    input.readOnly = false;
    input.placeholder = run.placeholder;
  }
  if (form) {
    delete form.dataset.demoPhase;
    form.querySelector('button[type="submit"]').disabled = false;
  }
  if (messages) messages.classList.remove('is-demo-running');
}

function stopChatDemo() {
  if (activeChatDemo) finishChatDemo(activeChatDemo, true);
}

function createChatDemoExchange(run, round) {
  const exchange = {
    question: chatDemoScript[round - 1].question,
    demo: { id: `${run.id}-${round}`, state: 'thinking', thinking: [], text: '' }
  };
  chatHistory.push(exchange);
  run.exchange = exchange;
  return exchange;
}

async function playChatDemo(run) {
  try {
    for (let round = 1; round <= chatDemoScript.length; round++) {
      if (round === 2) {
        setChatDemoPhase(run, 'reading');
        await waitForChatDemo(run, 1800);
        setChatDemoPhase(run, 'typing');
        const input = document.querySelector('#questionInput');
        input.focus({ preventScroll: true });
        for (const character of chatDemoScript[1].question) {
          await waitForChatDemo(run, /[，、“”？]/u.test(character) ? 210 : 65 + Math.random() * 65);
          input.value += character;
          input.setSelectionRange(input.value.length, input.value.length);
          input.scrollLeft = input.scrollWidth;
        }
        await waitForChatDemo(run, 700);
        setChatDemoPhase(run, 'sending');
        await waitForChatDemo(run, 280);
        input.value = '';
        const exchange = createChatDemoExchange(run, round);
        const messages = document.querySelector('#chatMessages');
        messages.insertAdjacentHTML('beforeend', renderChatDemoExchange(exchange));
        messages.scrollTop = messages.scrollHeight;
      }
      setChatDemoPhase(run, 'thinking');
      const exchange = run.exchange;
      await waitForChatDemo(run, 600);
      const thinkingSteps = language === 'en' ? chatDemoScript[round - 1].thinkingStepsEn : chatDemoScript[round - 1].thinkingSteps;
      for (const step of thinkingSteps) {
        exchange.demo.thinking.push('');
        for (const character of step) {
          exchange.demo.thinking[exchange.demo.thinking.length - 1] += character;
          updateChatDemoReply(exchange);
          await waitForChatDemo(run, 24);
        }
        await waitForChatDemo(run, 550);
      }
      await waitForChatDemo(run, 900);
      exchange.demo.state = 'answering';
      setChatDemoPhase(run, 'answering');
      const answer = Array.from(chatDemoScript[round - 1].answer);
      let cursor = 0;
      while (cursor < answer.length) {
        const count = 1 + Math.floor(Math.random() * 3);
        exchange.demo.text += answer.slice(cursor, cursor + count).join('');
        cursor += count;
        updateChatDemoReply(exchange);
        const lastCharacter = exchange.demo.text.slice(-1);
        const outputDelay = /[。；：\n]/u.test(lastCharacter) ? 220 : /[，、]/u.test(lastCharacter) ? 110 : 45 + Math.random() * 35;
        await waitForChatDemo(run, outputDelay / 2);
      }
      exchange.demo.state = 'complete';
      updateChatDemoReply(exchange);
    }
    finishChatDemo(run, false);
  } catch (error) {
    finishChatDemo(run, true);
    if (error.name !== 'AbortError') console.error('Unable to play the Q&A demo.', error);
  }
}

function startChatDemo() {
  if (activeChatDemo) return;
  const run = { id: ++chatDemoSequence, controller: new AbortController(), phase: 'thinking', exchange: null, placeholder: '' };
  activeChatDemo = run;
  homeChatExpanded = true;
  createChatDemoExchange(run, 1);
  root.innerHTML = renderHome();
  applyLanguage();
  const input = document.querySelector('#questionInput');
  const messages = document.querySelector('#chatMessages');
  run.placeholder = input.placeholder;
  input.value = '';
  input.readOnly = true;
  document.querySelector('#askForm button[type="submit"]').disabled = true;
  messages.classList.add('is-demo-running');
  messages.scrollTop = messages.scrollHeight;
  input.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  void playChatDemo(run);
}

window.addEventListener('pagehide', stopChatDemo);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') stopChatDemo();
});
