export interface BuiltinSkill {
  slug: string
  name: string
  category: string
  author: string
  description: string
  source: string
}

const rows: Array<[string, string, string, string, string, string]> = [
  ['frontend-design-direction','前端设计方向','design','affaan-m','前端设计方向、美学原则与一致的设计语言实现。','https://www.skillhub.club/skill/affaan-m-everything-claude-code-frontend-design-direction'],
  ['accessibility-everything-claude-code','无障碍设计','design','affaan-m','使用 WCAG 2.2 AA 标准设计、实现和审查包容性的数字产品。','https://www.skillhub.club/skill/affaan-m-everything-claude-code-accessibility'],
  ['design-system-ecc','设计系统','design','affaan-m','构建具备无障碍、响应式、主题、组件和设计令牌的生产级设计系统。','https://www.skillhub.club/skill/affaan-m-ecc-design-system'],
  ['liquid-glass-design-everything','液态玻璃设计','design','affaan-m','创建具有层次感、透明度、景深和精致动效的液态玻璃视觉界面。','https://www.skillhub.club/skill/affaan-m-everything-claude-code-liquid-glass-design'],
  ['loop-design-check','循环设计检查','design','affaan-m','设计面向目标的智能体循环，并审查其反馈、停止条件和可观测性。','https://www.skillhub.club/skill/affaan-m-everything-claude-code-loop-design-check'],
  ['liquid-glass-design-ecc','液态玻璃设计（ECC）','design','affaan-m','将液态玻璃视觉语言应用于清晰、可用且可访问的产品界面。','https://www.skillhub.club/skill/affaan-m-ecc-liquid-glass-design'],
  ['accessibility-ecc','无障碍设计（ECC）','design','affaan-m','使用 WCAG 2.2 AA 标准设计、实现和审查包容性的数字产品。','https://www.skillhub.club/skill/affaan-m-ecc-accessibility'],
  ['popular-web-designs','流行网页设计','design','NousResearch','参考 Stripe、Linear、Vercel 等 54 个真实设计系统，提炼可复用的网页设计模式。','https://www.skillhub.club/skill/nousresearch-hermes-agent-popular-web-designs'],
  ['design-md','DESIGN.md 设计规范','design','NousResearch','编写、校验和导出 Google DESIGN.md 风格的设计令牌规范。','https://www.skillhub.club/skill/nousresearch-hermes-agent-design-md'],
  ['claude-design','Claude 单页设计','design','NousResearch','设计一次性 HTML 产物，例如落地页、演示文稿和原型。','https://www.skillhub.club/skill/nousresearch-hermes-agent-claude-design'],
  ['stable-diffusion-image-generation','Stable Diffusion 图像生成','design','NousResearch','使用 Stable Diffusion 进行文生图、局部重绘和图生图。','https://www.skillhub.club/skill/nousresearch-hermes-agent-stable-diffusion'],
  ['n8n-design-system','n8n 设计系统','design','n8n-io','遵循 n8n 设计系统的样式和组件使用指南。','https://www.skillhub.club/skill/n8n-io-n8n-design-system'],
  ['n8n-content-design','n8n 内容设计','design','n8n-io','面向产品界面文案的内容设计助手。','https://www.skillhub.club/skill/n8n-io-n8n-content-design'],
  ['exa-search-ecc','Exa 神经搜索（ECC）','research','affaan-m','通过 Exa MCP 对网页、代码和公司进行神经搜索。','https://www.skillhub.club/skill/affaan-m-ecc-exa-search'],
  ['exa-search-everything','Exa 神经搜索','research','affaan-m','通过 Exa MCP 对网页、代码和公司进行神经搜索。','https://www.skillhub.club/skill/affaan-m-everything-claude-code-exa-search'],
  ['research-ops','研究运营','research','affaan-m','证据优先的现状研究工作流，结合公开证据和提供的本地上下文。','https://www.skillhub.club/skill/affaan-m-everything-claude-code-research-ops'],
  ['deep-research','深度研究','research','affaan-m','使用 Firecrawl 和 Exa 进行多来源深度研究。','https://www.skillhub.club/skill/affaan-m-everything-claude-code-deep-research'],
  ['prediction-market-oracle-research-ecc','预测市场预言机研究','research','affaan-m','研究如何把预测市场作为数据源或预言机。','https://www.skillhub.club/skill/affaan-m-ecc-prediction-market-oracle-research'],
  ['prediction-market-oracle-research-everything','预测市场预言机研究（ECC）','research','affaan-m','研究如何把预测市场作为数据源或预言机。','https://www.skillhub.club/skill/affaan-m-everything-claude-code-prediction-market-oracle-research'],
  ['literature-review-everything','文献综述','research','affaan-m','面向学术、生物医学、技术和科学主题的系统性文献综述工作流。','https://www.skillhub.club/skill/affaan-m-everything-claude-code-scientific-thinking-literature-review'],
  ['market-research','市场研究','research','affaan-m','开展市场研究、竞争分析和行业洞察。','https://www.skillhub.club/skill/affaan-m-everything-claude-code-market-research'],
  ['literature-review-ecc','文献综述（ECC）','research','affaan-m','面向学术、生物医学、技术和科学主题的系统性文献综述工作流。','https://www.skillhub.club/skill/affaan-m-ecc-scientific-thinking-literature-review'],
  ['parallel-cli','并行 CLI 研究','research','NousResearch','面向智能体的网页搜索、深度研究和信息 enrichment 工作流。','https://www.skillhub.club/skill/nousresearch-hermes-agent-parallel-cli'],
  ['drug-discovery','药物发现','research','NousResearch','用于药物发现研究的制药研究助手。','https://www.skillhub.club/skill/nousresearch-hermes-agent-drug-discovery'],
  ['research-paper-writing','研究论文写作','research','NousResearch','为 NeurIPS、ICML、ICLR 撰写机器学习论文，覆盖设计到投稿。','https://www.skillhub.club/skill/nousresearch-hermes-agent-research-paper-writing'],
  ['documentation-lookup-everything','文档查询','documentation','affaan-m','通过 Context7 获取最新的库和框架文档。','https://www.skillhub.club/skill/affaan-m-everything-claude-code-documentation-lookup'],
  ['visa-doc-translate','签证材料翻译','documentation','affaan-m','将签证申请材料图片翻译成英文，并生成包含原文和译文的双语 PDF。','https://www.skillhub.club/skill/affaan-m-everything-claude-code-visa-doc-translate'],
  ['documentation-lookup-ecc','文档查询（ECC）','documentation','affaan-m','通过 Context7 获取最新的库和框架文档。','https://www.skillhub.club/skill/affaan-m-ecc-documentation-lookup'],
  ['agentic-os','智能体操作系统','documentation','affaan-m','在 Claude Code 之上构建持久化的多智能体操作系统。','https://www.skillhub.club/skill/affaan-m-everything-claude-code-agentic-os'],
  ['nutrient-document-processing-everything','Nutrient 文档处理','documentation','affaan-m','使用 Nutrient DWS API 处理、转换、OCR、提取、编辑、签署和表单填充文档。','https://www.skillhub.club/skill/affaan-m-everything-claude-code-nutrient-document-processing'],
  ['nutrient-document-processing-ecc','Nutrient 文档处理（ECC）','documentation','affaan-m','使用 Nutrient DWS API 处理、转换、OCR、提取、编辑、签署和表单填充文档。','https://www.skillhub.club/skill/affaan-m-ecc-nutrient-document-processing'],
  ['ocr-and-documents','OCR 与文档','documentation','NousResearch','从 PDF 和扫描件中提取文本，支持 PyMuPDF 和 marker-pdf。','https://www.skillhub.club/skill/nousresearch-hermes-agent-ocr-and-documents'],
  ['n8n-docs-assistant','n8n 文档助手','documentation','n8n-io','回答 n8n 产品、安装、凭据、节点、托管和配置问题。','https://www.skillhub.club/skill/n8n-io-n8n-n8n-docs-assistant'],
  ['article-writing-everything','文章写作','writing','affaan-m','撰写文章、指南、博客、教程和新闻稿。','https://www.skillhub.club/skill/affaan-m-everything-claude-code-article-writing'],
  ['video-editing-everything','视频剪辑','writing','affaan-m','使用 AI 辅助视频剪辑，完成剪切、排序和后期处理。','https://www.skillhub.club/skill/affaan-m-everything-claude-code-video-editing'],
  ['video-editing-ecc','视频剪辑（ECC）','writing','affaan-m','使用 AI 辅助视频剪辑，完成剪切、排序和后期处理。','https://www.skillhub.club/skill/affaan-m-ecc-video-editing'],
  ['article-writing-ecc','文章写作（ECC）','writing','affaan-m','撰写文章、指南、博客、教程和新闻稿。','https://www.skillhub.club/skill/affaan-m-ecc-article-writing'],
  ['writing-for-agents','面向智能体的写作','writing','mattpocock','为智能体编写文档和可执行的说明。','https://www.skillhub.club/skill/mattpocock-skills-writing-for-agents'],
]

export const BUILTIN_SKILLS: BuiltinSkill[] = rows.map(([slug, name, category, author, description, source]) => ({ slug, name, category, author, description, source }))
