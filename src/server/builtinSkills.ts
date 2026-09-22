export interface BuiltinSkill {
  slug: string
  /** Chinese name (base value; also what zh mode displays). */
  name: string
  /** English name shown when the UI language is English. */
  nameEn: string
  category: string
  author: string
  /** Chinese description (base value; also what zh mode displays). */
  description: string
  /** English description shown when the UI language is English. */
  descriptionEn: string
  source: string
}

interface Row {
  slug: string
  name: string
  nameEn: string
  category: string
  author: string
  description: string
  descriptionEn: string
  source: string
}

const rows: Row[] = [
  { slug: 'frontend-design-direction', name: '前端设计方向', nameEn: 'Frontend Design Direction', category: 'design', author: 'affaan-m', description: '前端设计方向、美学原则与一致的设计语言实现。', descriptionEn: 'Frontend design direction, aesthetic principles, and consistent design language implementation.', source: 'https://www.skillhub.club/skill/affaan-m-everything-claude-code-frontend-design-direction' },
  { slug: 'accessibility-everything-claude-code', name: '无障碍设计', nameEn: 'Accessibility', category: 'design', author: 'affaan-m', description: '使用 WCAG 2.2 AA 标准设计、实现和审查包容性的数字产品。', descriptionEn: 'Design, implement, and audit inclusive digital products against WCAG 2.2 AA.', source: 'https://www.skillhub.club/skill/affaan-m-everything-claude-code-accessibility' },
  { slug: 'design-system-ecc', name: '设计系统', nameEn: 'Design System', category: 'design', author: 'affaan-m', description: '构建具备无障碍、响应式、主题、组件和设计令牌的生产级设计系统。', descriptionEn: 'Build production-grade design systems with accessibility, responsive layouts, themes, components, and design tokens.', source: 'https://www.skillhub.club/skill/affaan-m-ecc-design-system' },
  { slug: 'liquid-glass-design-everything', name: '液态玻璃设计', nameEn: 'Liquid Glass Design', category: 'design', author: 'affaan-m', description: '创建具有层次感、透明度、景深和精致动效的液态玻璃视觉界面。', descriptionEn: 'Create liquid-glass visual interfaces with layering, transparency, depth, and refined motion.', source: 'https://www.skillhub.club/skill/affaan-m-everything-claude-code-liquid-glass-design' },
  { slug: 'loop-design-check', name: '循环设计检查', nameEn: 'Loop Design Check', category: 'design', author: 'affaan-m', description: '设计面向目标的智能体循环，并审查其反馈、停止条件和可观测性。', descriptionEn: 'Design goal-driven agent loops and review their feedback, stop conditions, and observability.', source: 'https://www.skillhub.club/skill/affaan-m-everything-claude-code-loop-design-check' },
  { slug: 'liquid-glass-design-ecc', name: '液态玻璃设计（ECC）', nameEn: 'Liquid Glass Design (ECC)', category: 'design', author: 'affaan-m', description: '将液态玻璃视觉语言应用于清晰、可用且可访问的产品界面。', descriptionEn: 'Apply the liquid-glass visual language to clear, usable, and accessible product interfaces.', source: 'https://www.skillhub.club/skill/affaan-m-ecc-liquid-glass-design' },
  { slug: 'accessibility-ecc', name: '无障碍设计（ECC）', nameEn: 'Accessibility (ECC)', category: 'design', author: 'affaan-m', description: '使用 WCAG 2.2 AA 标准设计、实现和审查包容性的数字产品。', descriptionEn: 'Design, implement, and audit inclusive digital products against WCAG 2.2 AA.', source: 'https://www.skillhub.club/skill/affaan-m-ecc-accessibility' },
  { slug: 'popular-web-designs', name: '流行网页设计', nameEn: 'Popular Web Designs', category: 'design', author: 'NousResearch', description: '参考 Stripe、Linear、Vercel 等 54 个真实设计系统，提炼可复用的网页设计模式。', descriptionEn: 'Distill reusable web design patterns from 54 real design systems including Stripe, Linear, and Vercel.', source: 'https://www.skillhub.club/skill/nousresearch-hermes-agent-popular-web-designs' },
  { slug: 'design-md', name: 'DESIGN.md 设计规范', nameEn: 'DESIGN.md Specification', category: 'design', author: 'NousResearch', description: '编写、校验和导出 Google DESIGN.md 风格的设计令牌规范。', descriptionEn: 'Write, validate, and export Google DESIGN.md-style design token specifications.', source: 'https://www.skillhub.club/skill/nousresearch-hermes-agent-design-md' },
  { slug: 'claude-design', name: 'Claude 单页设计', nameEn: 'Claude One-shot Design', category: 'design', author: 'NousResearch', description: '设计一次性 HTML 产物，例如落地页、演示文稿和原型。', descriptionEn: 'Design one-shot HTML artifacts such as landing pages, slide decks, and prototypes.', source: 'https://www.skillhub.club/skill/nousresearch-hermes-agent-claude-design' },
  { slug: 'stable-diffusion-image-generation', name: 'Stable Diffusion 图像生成', nameEn: 'Stable Diffusion Image Generation', category: 'design', author: 'NousResearch', description: '使用 Stable Diffusion 进行文生图、局部重绘和图生图。', descriptionEn: 'Text-to-image, inpainting, and image-to-image generation with Stable Diffusion.', source: 'https://www.skillhub.club/skill/nousresearch-hermes-agent-stable-diffusion' },
  { slug: 'n8n-design-system', name: 'n8n 设计系统', nameEn: 'n8n Design System', category: 'design', author: 'n8n-io', description: '遵循 n8n 设计系统的样式和组件使用指南。', descriptionEn: 'Style and component usage guide following the n8n design system.', source: 'https://www.skillhub.club/skill/n8n-io-n8n-design-system' },
  { slug: 'n8n-content-design', name: 'n8n 内容设计', nameEn: 'n8n Content Design', category: 'design', author: 'n8n-io', description: '面向产品界面文案的内容设计助手。', descriptionEn: 'Content design assistant for product interface copy.', source: 'https://www.skillhub.club/skill/n8n-io-n8n-content-design' },
  { slug: 'exa-search-ecc', name: 'Exa 神经搜索（ECC）', nameEn: 'Exa Neural Search (ECC)', category: 'research', author: 'affaan-m', description: '通过 Exa MCP 对网页、代码和公司进行神经搜索。', descriptionEn: 'Neural search across the web, code, and companies via the Exa MCP.', source: 'https://www.skillhub.club/skill/affaan-m-ecc-exa-search' },
  { slug: 'exa-search-everything', name: 'Exa 神经搜索', nameEn: 'Exa Neural Search', category: 'research', author: 'affaan-m', description: '通过 Exa MCP 对网页、代码和公司进行神经搜索。', descriptionEn: 'Neural search across the web, code, and companies via the Exa MCP.', source: 'https://www.skillhub.club/skill/affaan-m-everything-claude-code-exa-search' },
  { slug: 'research-ops', name: '研究运营', nameEn: 'Research Ops', category: 'research', author: 'affaan-m', description: '证据优先的现状研究工作流，结合公开证据和提供的本地上下文。', descriptionEn: 'Evidence-first current-state research workflows combining public evidence with provided local context.', source: 'https://www.skillhub.club/skill/affaan-m-everything-claude-code-research-ops' },
  { slug: 'deep-research', name: '深度研究', nameEn: 'Deep Research', category: 'research', author: 'affaan-m', description: '使用 Firecrawl 和 Exa 进行多来源深度研究。', descriptionEn: 'Multi-source deep research using Firecrawl and Exa.', source: 'https://www.skillhub.club/skill/affaan-m-everything-claude-code-deep-research' },
  { slug: 'prediction-market-oracle-research-ecc', name: '预测市场预言机研究', nameEn: 'Prediction Market Oracle Research', category: 'research', author: 'affaan-m', description: '研究如何把预测市场作为数据源或预言机。', descriptionEn: 'Research how to use prediction markets as a data source or oracle.', source: 'https://www.skillhub.club/skill/affaan-m-ecc-prediction-market-oracle-research' },
  { slug: 'prediction-market-oracle-research-everything', name: '预测市场预言机研究（ECC）', nameEn: 'Prediction Market Oracle Research (ECC)', category: 'research', author: 'affaan-m', description: '研究如何把预测市场作为数据源或预言机。', descriptionEn: 'Research how to use prediction markets as a data source or oracle.', source: 'https://www.skillhub.club/skill/affaan-m-everything-claude-code-prediction-market-oracle-research' },
  { slug: 'literature-review-everything', name: '文献综述', nameEn: 'Literature Review', category: 'research', author: 'affaan-m', description: '面向学术、生物医学、技术和科学主题的系统性文献综述工作流。', descriptionEn: 'Systematic literature review workflows for academic, biomedical, technical, and scientific topics.', source: 'https://www.skillhub.club/skill/affaan-m-everything-claude-code-scientific-thinking-literature-review' },
  { slug: 'market-research', name: '市场研究', nameEn: 'Market Research', category: 'research', author: 'affaan-m', description: '开展市场研究、竞争分析和行业洞察。', descriptionEn: 'Run market research, competitive analysis, and industry insight studies.', source: 'https://www.skillhub.club/skill/affaan-m-everything-claude-code-market-research' },
  { slug: 'literature-review-ecc', name: '文献综述（ECC）', nameEn: 'Literature Review (ECC)', category: 'research', author: 'affaan-m', description: '面向学术、生物医学、技术和科学主题的系统性文献综述工作流。', descriptionEn: 'Systematic literature review workflows for academic, biomedical, technical, and scientific topics.', source: 'https://www.skillhub.club/skill/affaan-m-ecc-scientific-thinking-literature-review' },
  { slug: 'parallel-cli', name: '并行 CLI 研究', nameEn: 'Parallel CLI Research', category: 'research', author: 'NousResearch', description: '面向智能体的网页搜索、深度研究和信息 enrichment 工作流。', descriptionEn: 'Agent-oriented web search, deep research, and information enrichment workflows.', source: 'https://www.skillhub.club/skill/nousresearch-hermes-agent-parallel-cli' },
  { slug: 'drug-discovery', name: '药物发现', nameEn: 'Drug Discovery', category: 'research', author: 'NousResearch', description: '用于药物发现研究的制药研究助手。', descriptionEn: 'Pharmaceutical research assistant for drug discovery studies.', source: 'https://www.skillhub.club/skill/nousresearch-hermes-agent-drug-discovery' },
  { slug: 'research-paper-writing', name: '研究论文写作', nameEn: 'Research Paper Writing', category: 'research', author: 'NousResearch', description: '为 NeurIPS、ICML、ICLR 撰写机器学习论文，覆盖设计到投稿。', descriptionEn: 'Write machine learning papers for NeurIPS, ICML, and ICLR, from design through submission.', source: 'https://www.skillhub.club/skill/nousresearch-hermes-agent-research-paper-writing' },
  { slug: 'documentation-lookup-everything', name: '文档查询', nameEn: 'Documentation Lookup', category: 'documentation', author: 'affaan-m', description: '通过 Context7 获取最新的库和框架文档。', descriptionEn: 'Fetch up-to-date library and framework documentation through Context7.', source: 'https://www.skillhub.club/skill/affaan-m-everything-claude-code-documentation-lookup' },
  { slug: 'visa-doc-translate', name: '签证材料翻译', nameEn: 'Visa Document Translation', category: 'documentation', author: 'affaan-m', description: '将签证申请材料图片翻译成英文，并生成包含原文和译文的双语 PDF。', descriptionEn: 'Translate visa application document images into English and produce bilingual PDFs with source and translation.', source: 'https://www.skillhub.club/skill/affaan-m-everything-claude-code-visa-doc-translate' },
  { slug: 'documentation-lookup-ecc', name: '文档查询（ECC）', nameEn: 'Documentation Lookup (ECC)', category: 'documentation', author: 'affaan-m', description: '通过 Context7 获取最新的库和框架文档。', descriptionEn: 'Fetch up-to-date library and framework documentation through Context7.', source: 'https://www.skillhub.club/skill/affaan-m-ecc-documentation-lookup' },
  { slug: 'agentic-os', name: '智能体操作系统', nameEn: 'Agentic OS', category: 'documentation', author: 'affaan-m', description: '在 Claude Code 之上构建持久化的多智能体操作系统。', descriptionEn: 'Build a persistent multi-agent operating system on top of Claude Code.', source: 'https://www.skillhub.club/skill/affaan-m-everything-claude-code-agentic-os' },
  { slug: 'nutrient-document-processing-everything', name: 'Nutrient 文档处理', nameEn: 'Nutrient Document Processing', category: 'documentation', author: 'affaan-m', description: '使用 Nutrient DWS API 处理、转换、OCR、提取、编辑、签署和表单填充文档。', descriptionEn: 'Process, convert, OCR, extract, edit, sign, and fill documents with the Nutrient DWS API.', source: 'https://www.skillhub.club/skill/affaan-m-everything-claude-code-nutrient-document-processing' },
  { slug: 'nutrient-document-processing-ecc', name: 'Nutrient 文档处理（ECC）', nameEn: 'Nutrient Document Processing (ECC)', category: 'documentation', author: 'affaan-m', description: '使用 Nutrient DWS API 处理、转换、OCR、提取、编辑、签署和表单填充文档。', descriptionEn: 'Process, convert, OCR, extract, edit, sign, and fill documents with the Nutrient DWS API.', source: 'https://www.skillhub.club/skill/affaan-m-ecc-nutrient-document-processing' },
  { slug: 'ocr-and-documents', name: 'OCR 与文档', nameEn: 'OCR & Documents', category: 'documentation', author: 'NousResearch', description: '从 PDF 和扫描件中提取文本，支持 PyMuPDF 和 marker-pdf。', descriptionEn: 'Extract text from PDFs and scans, with PyMuPDF and marker-pdf support.', source: 'https://www.skillhub.club/skill/nousresearch-hermes-agent-ocr-and-documents' },
  { slug: 'n8n-docs-assistant', name: 'n8n 文档助手', nameEn: 'n8n Docs Assistant', category: 'documentation', author: 'n8n-io', description: '回答 n8n 产品、安装、凭据、节点、托管和配置问题。', descriptionEn: 'Answer questions about n8n products, installation, credentials, nodes, hosting, and configuration.', source: 'https://www.skillhub.club/skill/n8n-io-n8n-n8n-docs-assistant' },
  { slug: 'article-writing-everything', name: '文章写作', nameEn: 'Article Writing', category: 'writing', author: 'affaan-m', description: '撰写文章、指南、博客、教程和新闻稿。', descriptionEn: 'Write articles, guides, blogs, tutorials, and press releases.', source: 'https://www.skillhub.club/skill/affaan-m-everything-claude-code-article-writing' },
  { slug: 'video-editing-everything', name: '视频剪辑', nameEn: 'Video Editing', category: 'writing', author: 'affaan-m', description: '使用 AI 辅助视频剪辑，完成剪切、排序和后期处理。', descriptionEn: 'AI-assisted video editing for cutting, sequencing, and post-production.', source: 'https://www.skillhub.club/skill/affaan-m-everything-claude-code-video-editing' },
  { slug: 'video-editing-ecc', name: '视频剪辑（ECC）', nameEn: 'Video Editing (ECC)', category: 'writing', author: 'affaan-m', description: '使用 AI 辅助视频剪辑，完成剪切、排序和后期处理。', descriptionEn: 'AI-assisted video editing for cutting, sequencing, and post-production.', source: 'https://www.skillhub.club/skill/affaan-m-ecc-video-editing' },
  { slug: 'article-writing-ecc', name: '文章写作（ECC）', nameEn: 'Article Writing (ECC)', category: 'writing', author: 'affaan-m', description: '撰写文章、指南、博客、教程和新闻稿。', descriptionEn: 'Write articles, guides, blogs, tutorials, and press releases.', source: 'https://www.skillhub.club/skill/affaan-m-ecc-article-writing' },
  { slug: 'writing-for-agents', name: '面向智能体的写作', nameEn: 'Writing for Agents', category: 'writing', author: 'mattpocock', description: '为智能体编写文档和可执行的说明。', descriptionEn: 'Write documentation and executable instructions for agents.', source: 'https://www.skillhub.club/skill/mattpocock-skills-writing-for-agents' },
]

export const BUILTIN_SKILLS: BuiltinSkill[] = rows.map(
  ({ slug, name, nameEn, category, author, description, descriptionEn, source }) => ({
    slug,
    name,
    nameEn,
    category,
    author,
    description,
    descriptionEn,
    source,
  }),
)
