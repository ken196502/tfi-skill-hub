const companies = [
  {id:'force-info',name:'力源信息',symbol:'芯',field:'电子元器件',intro:'原站人工智能专题列示企业，当前迁入企业名称与领域标签；详细介绍、来源和更新时间待后台补全。'},
  {id:'black-sesame',name:'黑芝麻智能科技有限公司',symbol:'黑',field:'车规级智能汽车计算芯片',city:'武汉',intro:'黑芝麻智能科技有限公司成立于2016年，总部位于湖北武汉，是一家车规级智能汽车计算芯片及基于芯片的解决方案供应商。公司专注于自动驾驶、智能座舱、先进成像及互联等领域。原页面记载公司于2024年在香港交易所主板挂牌上市，股票代码2533.HK。',details:[['智能汽车业务','公司基于华山系列和武当系列车规级 SoC 芯片，提供自动驾驶、智能座舱等解决方案。原文称，截至2023年12月31日，华山A1000系列SoC总出货量超过15.2万片。'],['智能影像与车路协同','原文介绍其车规级图像处理核心、视觉感知技术与 DynamAI NN 引擎，支持车路协同解决方案。'],['技术介绍','原文介绍华山A2000家族搭载自研“九韶”NPU架构。产品性能与当前状态均未在本原型中独立验证。']]},
  {id:'three-gorges-data',name:'三峡集团数据中心',symbol:'峡',field:'数据中心与算力基础设施',intro:'原站人工智能专题列示的产业机构/项目主体。具体规范名称、所在地、建设运营关系与企业档案待核验。'},
  {id:'sugon-center',name:'中科曙光智算中心',symbol:'曙',field:'智能算力基础设施',intro:'原站人工智能专题列示主体。项目所在地、运营主体和具体业务档案待补充来源后确认。'},
  {id:'silan-hubei',name:'思朗科技（湖北）有限公司',symbol:'思',field:'芯片',intro:'原站人工智能专题列示企业，当前迁入企业名称与领域标签；详细介绍、来源和更新时间待后台补全。'},
  {id:'daji',name:'大势智慧',symbol:'势',field:'产业应用',intro:'原站人工智能专题列示企业，详细档案待后台补全与审核。'},
  {id:'chaoqing',name:'超擎数智',symbol:'超',field:'产业应用',intro:'原站人工智能专题列示企业，详细档案待后台补全与审核。'},
  {id:'iflytek-central',name:'讯飞华中',symbol:'讯',field:'语音与模型',intro:'原站人工智能专题列示企业/机构，规范主体名称与详细档案待后台核验。'},
  {id:'mindray',name:'明德生物',symbol:'明',field:'医疗应用',intro:'原站人工智能专题列示企业，详细档案待后台补全与审核。'},
  {id:'fuxin',name:'福鑫科创',symbol:'福',field:'产业应用',intro:'原站人工智能专题列示企业，详细档案待后台补全与审核。'},
  {id:'landing-med',name:'兰丁智能医学',symbol:'兰',field:'智能医学',intro:'原站人工智能专题列示企业，详细档案待后台补全与审核。'},
  {id:'changyingtong-optical',name:'武汉长盈通光电技术股份有限公司',alias:'长盈通',symbol:'长',field:'激光宏加工 · 光模块 · 光纤',fieldEn:'Laser macro-processing · Optical modules · Optical fiber',tags:['激光宏加工','光模块','光纤'],chapter:'1、2、7、10',intro:'光通信分册企业附录将其列入激光宏加工、光模块及光纤相关条目。当前仅迁入名称与行业分类，企业介绍待补充审核。',sourceKey:'optical-comms',sourceLabel:'光通信分册企业附录'},
  {id:'changjin-photonics',name:'武汉长进光子技术股份有限公司',alias:'长进光子',symbol:'进',field:'激光卫星 · 光纤',fieldEn:'Laser satellites · Optical fiber',tags:['激光卫星','光纤'],chapter:'9、10',intro:'光通信分册企业附录将其列入激光卫星、光纤相关条目。当前仅迁入名称与行业分类，企业介绍待补充审核。',sourceKey:'optical-comms',sourceLabel:'光通信分册企业附录'},
  {id:'changjiang-computing',name:'武汉长江计算科技有限公司',alias:'长江计算',symbol:'计',field:'光模块',fieldEn:'Optical modules',tags:['光模块'],chapter:'7',intro:'光通信分册企业附录将其列入光模块相关条目。当前仅迁入名称与行业分类，企业介绍待补充审核。',sourceKey:'optical-comms',sourceLabel:'光通信分册企业附录'},
  {id:'changfei-optical',name:'长飞光纤光缆股份有限公司',alias:'长飞光纤',symbol:'飞',field:'光模块 · 光纤',fieldEn:'Optical modules · Optical fiber',tags:['光模块','光纤'],chapter:'7、10',intro:'光通信分册企业附录将其列入光模块、光纤相关条目。当前仅迁入名称与行业分类，企业介绍待补充审核。',sourceKey:'optical-comms',sourceLabel:'光通信分册企业附录'},
  {id:'dongtian-micro',name:'湖北东田微科技股份有限公司',alias:'东田微',symbol:'东',field:'光交换机',fieldEn:'Optical switches',tags:['光交换机'],chapter:'8',intro:'光通信分册企业附录将其列入光交换机相关条目。当前仅迁入名称与行业分类，企业介绍待补充审核。',sourceKey:'optical-comms',sourceLabel:'光通信分册企业附录'},
  {id:'fiberhome-optical',name:'烽火通信科技股份有限公司',alias:'烽火通信',symbol:'烽',field:'激光其他 · 光模块 · 光纤',fieldEn:'Other laser applications · Optical modules · Optical fiber',tags:['其他激光','光模块','光纤'],chapter:'6、7、10',intro:'光通信分册企业附录将其列入激光其他、光模块及光纤相关条目。当前仅迁入名称与行业分类，企业介绍待补充审核。',sourceKey:'optical-comms',sourceLabel:'光通信分册企业附录'},
  {id:'guoke-optical',name:'武汉国科光领半导体科技有限公司',alias:'国科光领',symbol:'国',field:'光模块',fieldEn:'Optical modules',tags:['光模块'],chapter:'7',intro:'光通信分册企业附录将其列入光模块相关条目。当前仅迁入名称与行业分类，企业介绍待补充审核。',sourceKey:'optical-comms',sourceLabel:'光通信分册企业附录'},
  {id:'accelink-optical',name:'武汉光迅科技股份有限公司',alias:'光迅科技',symbol:'迅',field:'光模块 · 光交换机',fieldEn:'Optical modules · Optical switches',tags:['光模块','光交换机'],chapter:'7、8',intro:'光通信分册企业附录将其列入光模块、光交换机相关条目。当前仅迁入名称与行业分类，企业介绍待补充审核。',sourceKey:'optical-comms',sourceLabel:'光通信分册企业附录'},
  {id:'opticore',name:'武汉光库科技有限公司',alias:'光库科技',symbol:'库',field:'光交换机',fieldEn:'Optical switches',tags:['光交换机'],chapter:'8',intro:'光通信分册企业附录将其列入光交换机相关条目。当前仅迁入名称与行业分类，企业介绍待补充审核。',sourceKey:'optical-comms',sourceLabel:'光通信分册企业附录'},
  {id:'hgzy-optical',name:'武汉华工正源光子技术有限公司',alias:'华工正源',symbol:'正',field:'光模块 · 光交换机',fieldEn:'Optical modules · Optical switches',tags:['光模块','光交换机'],chapter:'7、8',intro:'光通信分册企业附录将其列入光模块、光交换机相关条目。当前仅迁入名称与行业分类，企业介绍待补充审核。',sourceKey:'optical-comms',sourceLabel:'光通信分册企业附录'},
  {id:'hgtech-optical',name:'华工科技产业股份有限公司',alias:'华工科技',symbol:'华',field:'激光宏、微加工 · 光模块 · 光交换机',fieldEn:'Laser macro/micro-processing · Optical modules · Optical switches',tags:['激光宏加工','激光微加工','光模块','光交换机'],chapter:'1、2、3、4、7、8',intro:'光通信分册企业附录将其列入激光宏、微加工、光模块及光交换机相关条目。当前仅迁入名称与行业分类，企业介绍待补充审核。',sourceKey:'optical-comms',sourceLabel:'光通信分册企业附录'},
  {id:'junheng-tech',name:'武汉钧恒科技有限公司',alias:'钧恒科技',symbol:'钧',field:'光模块',fieldEn:'Optical modules',tags:['光模块'],chapter:'7',intro:'光通信分册企业附录将其列入光模块相关条目。当前仅迁入名称与行业分类，企业介绍待补充审核。',sourceKey:'optical-comms',sourceLabel:'光通信分册企业附录'},
  {id:'jiuwei-photonics',name:'九维光子科技',alias:'九维光子',symbol:'九',field:'光交换机',fieldEn:'Optical switches',tags:['光交换机'],chapter:'8',intro:'光通信分册企业附录按“九维光子科技”列示其光交换机相关条目。当前仅迁入附录原名与行业分类，企业介绍及规范主体名称待核验。',sourceKey:'optical-comms',sourceLabel:'光通信分册企业附录'},
  {id:'innolight-optical',name:'武汉联特科技股份有限公司',alias:'联特科技',symbol:'联',field:'光模块',fieldEn:'Optical modules',tags:['光模块'],chapter:'7',intro:'光通信分册企业附录将其列入光模块相关条目。当前仅迁入名称与行业分类，企业介绍待补充审核。',sourceKey:'optical-comms',sourceLabel:'光通信分册企业附录'},
  {id:'minxin-semiconductor',name:'武汉敏芯半导体股份有限公司',alias:'敏芯股份',symbol:'敏',field:'光模块',fieldEn:'Optical modules',tags:['光模块'],chapter:'7',intro:'光通信分册企业附录将其列入光模块相关条目。当前仅迁入名称与行业分类，企业介绍待补充审核。',sourceKey:'optical-comms',sourceLabel:'光通信分册企业附录'},
  {id:'maiwei-communications',name:'武汉迈威通信股份有限公司',alias:'迈威通信',symbol:'迈',field:'光模块',fieldEn:'Optical modules',tags:['光模块'],chapter:'7',intro:'光通信分册企业附录将其列入光模块相关条目。当前仅迁入名称与行业分类，企业介绍待补充审核。',sourceKey:'optical-comms',sourceLabel:'光通信分册企业附录'},
  {id:'pusaisi-electronics',name:'武汉普赛斯电子有限公司',alias:'普赛斯电子',symbol:'普',field:'光模块',fieldEn:'Optical modules',tags:['光模块'],chapter:'7',intro:'光通信分册企业附录将其列入光模块相关条目。当前仅迁入名称与行业分类，企业介绍待补充审核。',sourceKey:'optical-comms',sourceLabel:'光通信分册企业附录'},
  {id:'raycus-laser',name:'武汉锐科光纤激光技术股份有限公司',alias:'锐科激光',symbol:'锐',field:'激光宏、微加工 · 光模块 · 激光雷达',fieldEn:'Laser macro/micro-processing · Optical modules · LiDAR',tags:['激光宏加工','激光微加工','光模块','激光雷达'],chapter:'1、2、3、4、5、7',intro:'光通信分册企业附录将其列入激光加工、光模块及激光雷达相关条目。当前仅迁入名称与行业分类，企业介绍待补充审核。',sourceKey:'optical-comms',sourceLabel:'光通信分册企业附录'},
  {id:'rayt-opto',name:'武汉锐奥特科技有限公司',alias:'锐奥特',symbol:'锐',field:'光模块',fieldEn:'Optical modules',tags:['光模块'],chapter:'7',intro:'光通信分册企业附录将其列入光模块相关条目。当前仅迁入名称与行业分类，企业介绍待补充审核。',sourceKey:'optical-comms',sourceLabel:'光通信分册企业附录'},
  {id:'yunzhi-optical',name:'武汉云智光联科技有限公司',alias:'云智光联',symbol:'云',field:'光交换机',fieldEn:'Optical switches',tags:['光交换机'],chapter:'8',intro:'光通信分册企业附录将其列入光交换机相关条目。当前仅迁入名称与行业分类，企业介绍待补充审核。',sourceKey:'optical-comms',sourceLabel:'光通信分册企业附录'},
  {id:'yunling-opto',name:'武汉云岭光电股份有限公司',alias:'云岭光电',symbol:'岭',field:'光模块',fieldEn:'Optical modules',tags:['光模块'],chapter:'7',intro:'光通信分册企业附录将其列入光模块相关条目。当前仅迁入名称与行业分类，企业介绍待补充审核。',sourceKey:'optical-comms',sourceLabel:'光通信分册企业附录'},
  {id:'yingfei-optical',name:'武汉英飞光创科技有限公司',alias:'英飞光创',symbol:'英',field:'光模块',fieldEn:'Optical modules',tags:['光模块'],chapter:'7',intro:'光通信分册企业附录将其列入光模块相关条目。当前仅迁入名称与行业分类，企业介绍待补充审核。',sourceKey:'optical-comms',sourceLabel:'光通信分册企业附录'}
];

const policies = [
  {id:'fiber-to-home-communications',name:'关于严格落实住宅项目光纤到户通信设施建设程序的通知',nameEn:'Notice on Fiber-to-the-Home Communications Facilities for Residential Projects',level:'市级',levelEn:'Municipal',issuer:'武汉市通信管理局；武汉市城乡建设局',issuerEn:'Wuhan Communications Administration; Wuhan Urban-Rural Development Bureau',date:'2021.4',category:'光纤到户',categoryEn:'Fiber-to-the-home',intro:'政策附录列示的住宅项目光纤到户通信设施建设相关文件。',introEn:'A listed municipal document concerning fiber-to-the-home communications facilities in residential projects.'},
  {id:'digital-economy-plan',name:'“十四五”数字经济发展规划',nameEn:'14th Five-Year Plan for Digital Economy Development',level:'国家级',levelEn:'National',issuer:'国务院',issuerEn:'State Council',date:'2022.1',category:'数字经济',categoryEn:'Digital economy',intro:'政策附录列示的国家级数字经济规划文件。',introEn:'A national digital economy plan listed in the supplied appendix.'},
  {id:'5g-industrial-internet',name:'打造“5G+工业互联网”512工程升级版实施方案',nameEn:'Implementation Plan for the Upgraded 5G + Industrial Internet 512 Project',level:'国家级',levelEn:'National',issuer:'工业和信息化部',issuerEn:'Ministry of Industry and Information Technology',date:'2024.12',category:'5G与工业互联网',categoryEn:'5G and industrial internet',intro:'政策附录列示的5G与工业互联网相关实施方案。',introEn:'An implementation plan on 5G and the industrial internet listed in the supplied appendix.'},
  {id:'wuhan-network-infrastructure',name:'武汉市推动网络基础设施建设提档升级行动方案（2024—2025年）',nameEn:'Wuhan Action Plan for Upgrading Network Infrastructure (2024–2025)',level:'市级',levelEn:'Municipal',issuer:'武汉市人民政府办公厅',issuerEn:'General Office of the Wuhan Municipal People’s Government',date:'2024.5',category:'网络基础设施',categoryEn:'Network infrastructure',intro:'政策附录列示的武汉市网络基础设施建设行动方案。',introEn:'A Wuhan action plan on upgrading network infrastructure listed in the supplied appendix.'},
  {id:'ai-information-communications',name:'“人工智能+信息通信”创新发展实施意见（2026—2028年）',nameEn:'Implementation Opinions on AI + Information and Communications (2026–2028)',level:'国家级',levelEn:'National',issuer:'工业和信息化部',issuerEn:'Ministry of Industry and Information Technology',date:'2026.6',category:'人工智能与信息通信',categoryEn:'AI and information and communications',intro:'政策附录列示的人工智能与信息通信领域实施意见。',introEn:'Opinions on AI and information and communications listed in the supplied appendix.'}
];

const industries = [
  {id:'artificial-intelligence',name:'人工智能',category:'软件、互联网与人工智能',status:'已迁入示例',intro:'当前已迁入内容聚焦人工智能专题，包含全国趋势、湖北布局、产业链与原站列示企业。',introEn:'Migrated content focuses on the AI profile, including national trends, Hubei plans, supply-chain layers and listed companies.',related:['software-ai'],companies:['force-info','black-sesame','three-gorges-data','sugon-center','silan-hubei','daji','chaoqing','iflytek-central','mindray','fuxin','landing-med'],source:'湖北产业知识库原站「软件、互联网与人工智能 / 人工智能」专题。'},
  {id:'smart-driving',name:'智能驾驶',category:'软件、互联网与人工智能',status:'待配置',intro:'原站人工智能专题提及的应用方向。独立行业介绍、产业链及城市覆盖尚未迁入。',introEn:'The original AI profile mentions intelligent driving as an application direction. A standalone overview, value chain and city coverage are pending configuration.',related:['software-ai'],companies:['black-sesame']}
];

const industryStarGroups = [
  {industryId:'tmt-hardware',name:'TMT硬件',nameEn:'TMT Hardware',source:'TMT硬件',satellites:[['laser-communications','激光与通信','Laser & Communications'],['tmt-semiconductors','半导体','Semiconductors'],['display','显示','Display'],['smart-terminal','智能终端','Smart Devices'],['compute-servers','算力及服务器','Computing Power & Servers']]},
  {industryId:'high-end-equipment',name:'高端装备及机器人',nameEn:'High-end Equipment & Robotics',source:'高端装备及机器人',satellites:[['advanced-manufacturing-equipment','高端制造设备','Advanced Manufacturing Equipment'],['robotics','机器人','Robotics']]},
  {industryId:'modern-manufacturing',name:'现代制造业',nameEn:'Modern Manufacturing',source:'现代制造业',satellites:[['automobile-manufacturing','汽车制造','Automotive Manufacturing'],['aerospace','航空航天','Aerospace'],['engineering-shipbuilding','工程与船舶','Engineering & Shipbuilding']]},
  {industryId:'energy-chem-environment',name:'能源化工环保',nameEn:'Energy, Chemicals & Environment',source:'能源化工环保',satellites:[['energy-new-energy','能源及新能源','Energy & New Energy'],['metals-chemicals','金属及化工','Metals & Chemicals'],['energy-environmental-protection','节能环保','Energy Conservation & Environmental Protection']]},
  {industryId:'mass-consumption',name:'大消费',nameEn:'Consumer Industries',source:'大消费',satellites:[['smart-home-appliances','智能家电','Smart Home Appliances'],['modern-textiles','现代纺织','Modern Textiles'],['agri-food-processing','现代农产品加工','Modern Agri-food Processing']]},
  {industryId:'software-ai',name:'软件、互联网与人工智能',nameEn:'Software, Internet & AI',source:'软件，互联网与人工智能',satellites:[['artificial-intelligence','人工智能','Artificial Intelligence','software-ai'],['software-network','软件与网络','Software & Internet'],['smart-driving','智能驾驶','Intelligent Driving'],['beidou-navigation','北斗及导航','Beidou & Navigation']]},
  {industryId:'big-health',name:'大健康',nameEn:'Healthcare',source:'大健康',satellites:[['biopharma','生物医药','Biopharmaceuticals'],['medical-devices','医疗器械','Medical Devices']]},
  {industryId:'commerce-culture-services',name:'商贸文化服务',nameEn:'Commerce, Culture & Services',source:'商贸文化服务',satellites:[['fintech','金融科技','FinTech'],['digital-creative','数字创意','Digital Creative Industries'],['technology-services','科技服务','Technology Services'],['modern-logistics','现代物流','Modern Logistics']]}
].map(group=>({...group,industry:industries.find(industry=>industry.id===group.industryId)||{id:group.industryId,name:group.name,category:'一级行业',status:'原站分类',intro:'根据原网站产业关系图收录的一级行业分类。',related:[],companies:[]}}));

const cities = [
  {id:'wuhan',name:'武汉',mark:'武',region:'一主引领 · 原站规划摘录',intro:'原专题提出以武汉为核心，依托东湖新技术开发区在光电子信息、生物健康、智能产业等方面的基础，打造人工智能创新策源地和产业集聚基地。',overview:{zh:['武汉市2024年人口约1381万人，经济稳中向好，GDP达21106.2亿元，同比增长5.2%。产业结构持续优化，三次产业比为2.4:31.2:66.4。农业稳产保供，农林牧渔业总产值897.75亿元，增长3.3%。工业韧劲增强，规上工业增加值增长4.6%，其中高技术制造业增加值增长23.7%。服务业活力提升，增加值增长6.1%，交通运输、仓储和邮政业增加值增长11.4%，现代服务业加速发展，租赁商务服务业、科技服务业分别增长17.6%和9.3%。消费市场复苏稳健，社会消费品零售总额7931.87亿元，增长5.3%，线上消费增长25.4%。对外贸易创新高，进出口总额4033.5亿元，增长11.8%，出口增长21.1%。','投资方面，固定资产投资增长3.1%，其中工业投资增长15.1%，基础设施投资增长8.0%，高技术产业投资增长18.2%。金融运行稳健，本外币存款余额40601.36亿元，增长5.5%。居民收入提升，人均可支配收入59732元，增长4.6%，城乡收入比为1.92:1。物价温和上涨，CPI上涨0.8%。总体来看，武汉经济正朝着高质量发展稳步迈进，在产业升级、内需扩大、开放合作等多方面取得积极成效，为中部崛起和长江经济带发展持续注入动力。'],en:['In 2024, Wuhan had a population of approximately 13.81 million. Its economy remained stable and improved, with GDP reaching RMB 2,110.62 billion, up 5.2% year over year. The industrial structure continued to improve, with the primary, secondary and tertiary sectors accounting for 2.4:31.2:66.4. Agriculture maintained stable production and supply: the total output value of agriculture, forestry, animal husbandry and fisheries was RMB 89.775 billion, an increase of 3.3%. Industrial resilience strengthened, with value added by large-scale industries rising 4.6%; high-tech manufacturing grew 23.7%. Services gained momentum, with value added up 6.1%. Transportation, storage and postal services grew 11.4%, while modern services accelerated: leasing and business services grew 17.6%, and technology services 9.3%. The consumer market recovered steadily: retail sales of consumer goods reached RMB 793.187 billion, up 5.3%, and online consumption grew 25.4%. Foreign trade reached a new high, with total imports and exports of RMB 403.35 billion, up 11.8%, including 21.1% growth in exports.','Fixed-asset investment grew 3.1%, including 15.1% growth in industrial investment, 8.0% in infrastructure investment and 18.2% in high-tech industry investment. Financial activity remained stable, with domestic and foreign currency deposits totaling RMB 4,060.136 billion, up 5.5%. Residents’ income increased: per capita disposable income reached RMB 59,732, up 4.6%, and the urban-to-rural income ratio was 1.92:1. Consumer prices rose moderately, with CPI up 0.8%. Overall, Wuhan’s economy is advancing steadily toward high-quality development, making progress in industrial upgrading, expanding domestic demand and opening-up, while continuing to contribute momentum to the rise of central China and the development of the Yangtze River Economic Belt.']},industries:['software-ai','semiconductor','compute','smart-driving'],companies:['black-sesame'],highlights:['人工智能创新策源与产业集聚（原站规划表述）','武汉先进算力中心（原站产业链提及）'],source:'湖北产业知识库原站人工智能专题；规划与设施信息需核验当前状态。'},
  {id:'xiangyang',name:'襄阳',mark:'襄',region:'两翼驱动 · 原站规划摘录',intro:'原专题提出支持襄阳发展差异化、特色化应用服务体系。当前示例没有迁入襄阳相关企业档案。',industries:['software-ai','smart-driving'],companies:[],highlights:['差异化、特色化应用服务体系（原站规划表述）'],source:'湖北产业知识库原站人工智能专题；未迁入具体项目和企业清单。'},
  {id:'yichang',name:'宜昌',mark:'宜',region:'两翼驱动 · 原站规划摘录',intro:'原专题提出支持宜昌发展差异化、特色化应用服务体系，并提及宜昌“存算一体”数据中心集群。当前示例未确认相关企业主体。',industries:['software-ai','compute'],companies:[],highlights:['差异化、特色化应用服务体系（原站规划表述）','“存算一体”数据中心集群（原站专题提及）'],source:'湖北产业知识库原站人工智能专题；设施建设与运营主体需上线前核实。'}
];

const hubeiMapUnits = window.hubeiMapUnits || [];
const mapCityNamesEn = {
  wuhan:'Wuhan',huangshi:'Huangshi',shiyan:'Shiyan',yichang:'Yichang',xiangyang:'Xiangyang',
  ezhou:'Ezhou',jingmen:'Jingmen',xiaogan:'Xiaogan',jingzhou:'Jingzhou',huanggang:'Huanggang',
  xianning:'Xianning',suizhou:'Suizhou',enshi:'Enshi',xiantao:'Xiantao',qianjiang:'Qianjiang',
  tianmen:'Tianmen',shennongjia:'Shennongjia Forestry District'
};
const existingCityIds = new Set(cities.map(city=>city.id));
cities.push(...hubeiMapUnits.filter(unit=>!existingCityIds.has(unit.id)).map(unit=>({
  id:unit.id,
  name:unit.name,
  mark:unit.name.slice(0,1),
  region:'湖北省 · 内容待配置',
  intro:'该城市专题资料待补充，当前暂未关联已审核的行业与企业信息。',
  industries:[],
  companies:[],
  highlights:[],
  source:'城市专题资料待后台补充与审核。'
})));

const chainLayers = [
  {name:'基础层',caption:'上游 · 算力与硬件',body:'AI 芯片、传感器、服务器、云计算和数据算力。原专题提及武汉先进算力中心、宜昌“存算一体”数据中心集群。'},
  {name:'技术层',caption:'中游 · 算法与模型',body:'算法、模型与框架研发；原专题提出智能软硬件、多模态通用大模型、类脑智能、群体智能与智能芯片等方向。'},
  {name:'应用层',caption:'下游 · 场景应用',body:'智能驾驶、智能座舱、智慧医疗、机器人、智慧城市与智能制造等应用方向。'}
];

const root = document.querySelector('#viewRoot');
const navLinks = [...document.querySelectorAll('.main-nav a')];
let language = localStorage.getItem('industry-map-language') || 'zh';
let chatHistory = [];
let homeGuideMode = 'industries';
let homeChatExpanded = false;
let previousAppHash = '';
let currentAppHash = location.hash || '#home';
history.scrollRestoration='manual';
const mapFocus = window.chinaMapViewport?.focus||{x:360,y:260};
const mapInitialScale = 5;
let mapScale = mapInitialScale;
let mapTranslateX = 360-mapFocus.x*mapInitialScale;
let mapTranslateY = 260-mapFocus.y*mapInitialScale;
let mapResizeObserver=null;
let mapGesture = null;
let mapPointers = new Map();
let mapDragDetected = false;
let suppressMapClick = false;
let mapStyle = localStorage.getItem('industry-map-map-style') === '1' ? '1' : '2';
let globeMapView = {zoom:1.6,panX:0,panY:0};
let globeMapController=null;
let globeMapGeneration=0;
let starView = {yaw:-0.32,pitch:0.18,zoom:1,selectedId:'software-ai',selectedSatellite:null};
let starStyle = localStorage.getItem('industry-map-star-style') === '2' ? '2' : '1';
let starMapRefresh=()=>{};
let starMapCleanup=()=>{};
let starPopupOpen=false;

const english = {
  '首页':'Home','新材料':'New materials','湖北产业知识库':'Hubei Industry Knowledge Base','发现湖北产业脉络，连接城市与企业':'Explore Hubei’s industries, connecting cities and companies','向湖北产业助手提问':'Ask the Hubei Industry Assistant','例如：湖北人工智能产业链有哪些重点方向？':'e.g. What are the key segments of Hubei’s AI industry?','开始提问':'Ask','仅依据本站已审核资料回答，不连接外网搜索':'Answers use reviewed site content only. No web search.','产业 · 城市 · 企业':'INDUSTRY · CITY · COMPANY','试着问':'Try asking','湖北人工智能产业链上游有哪些方向？':'What are the upstream sectors of Hubei’s AI industry?','武汉有哪些人工智能产业布局？':'What AI initiatives are in Wuhan?','黑芝麻智能是什么企业？':'What does Black Sesame Technologies do?','探索湖北产业':'Explore Hubei industries','切换行业与城市，查看重点专题':'Switch between industries and cities to explore featured profiles.','从产业关系出发':'Explore sector connections','查看重点城市布局':'Explore key city profiles','重点行业':'Featured industries','重点城市':'Featured cities','浏览行业专题、产业链与相关企业。':'Browse industry profiles, supply chains and related companies.','浏览城市产业规划与重点方向。':'Browse city plans and key sectors.','查看更多行业':'View all industries','查看更多城市':'View all cities','关联企业与机构':'linked companies and organizations','查看专题':'Explore profile','个行业方向':'industry directions','个示例城市':'sample cities','产业之间的关联可进入专题查看':'Explore sector connections in each profile','城市详情包含重点行业及相关企业':'City profiles include key sectors and related companies','选择探索维度':'Choose a dimension','产业专题':'Industry profiles','城市专题':'City profiles','以产业为线索，连接湖北各地发展脉络。':'Explore Hubei’s regions through their industries.','从产业关系出发':'Explore sector connections','查看重点城市布局':'Explore key city profiles','新材料产业专题':'New materials','围绕产业链、重点企业、城市布局与政策研究，了解湖北新材料产业。':'Explore Hubei’s new materials supply chains, companies, cities and policies.','专题内容正在整理，资料经审核发布后将在这里展示。':'This profile is being prepared and will appear here after review.','梳理上游材料、关键环节与应用方向。':'Map upstream materials, key links and applications.','汇集经审核发布的企业介绍与关联信息。':'Browse reviewed company profiles and relationships.','查看各地新材料产业重点方向。':'Explore regional new materials priorities.','整理政策文件、研究资料与来源信息。':'Browse policy, research and source materials.','内容审核后发布':'Published after content review','智能AI':'Smart AI','产业':'Industry','脉络':'Atlas','站内知识库 · 来源可追溯':'Site knowledge · Traceable sources','我':'You','演示回复 · 基于本站迁入资料':'Demo reply · Based on migrated site content',
  '产业发现':'Discover Hubei industries','从三个维度了解湖北产业':'Explore Hubei industries from three perspectives','浏览行业关联、城市布局和企业档案，或直接向产业助手提问。':'Explore industry connections, city clusters and company profiles, or ask the assistant directly.','行业专题':'Industry profiles','了解产业脉络与关联方向 →':'Explore sectors and connections →','城市地图':'City map','查看重点产业与区域布局 →':'View key sectors and regional plans →','企业档案':'Company profiles','查找企业及其行业关系 →':'Find companies and their industry links →','你可以试着问':'Try asking','提问':'Send',
  '湖北产业脉络':'Hubei Industry Knowledge Base','内容来源、时间与审核状态可追溯':'Traceable sources, dates and review status','演示数据 · 正式接入由后台配置':'Demo content · Managed through a separate CMS',
  ' AI 问答':' AI Assistant','AI 问答':'AI Assistant','行业':'Industries','城市':'Cities','企业':'Companies',
  '湖北产业知识助手':'Hubei Industry Assistant','优先从本站已审核发布的行业、城市与企业资料中检索，再由 LLM 整理回答。每个事实都应能回到来源。':'Ask questions about industries, cities, companies and supply chains. Answers are grounded in reviewed site content and linked to their sources.',
  '想了解湖北哪条产业脉络？':'Explore Hubei’s industries','可以问行业趋势、产业链、城市布局或具体企业。':'Ask about industry trends, supply chains, city clusters or companies.',
  '输入产业问题':'Enter your question','例如：湖北人工智能产业链上游有哪些方向？':'e.g. What are the upstream sectors of Hubei’s AI industry?','提问 ':'Ask ',
  '人工智能上游':'AI upstream','武汉产业布局':'Wuhan’s industry plan','企业档案':'Company profile','宜昌相关资料':'Yichang information',
  '知识边界':'Knowledge boundary','只检索本站已审核内容 · 事实带来源 · 无依据时回答资料不足 · 不开放外网搜索':'Reviewed site content only · Sources for factual claims · No unsupported answers · No web search',
  '行业地图':'Industry map','行业专题与行业关联':'Industry profiles and connections','城市地图':'City map','城市重点行业与企业':'City sectors and companies','企业档案':'Company directory','检索企业并查看详情':'Search and explore company profiles',
  '当前已配置知识样例':'Available knowledge sample','只展示已迁入的人工智能资料；其余条目以“待配置”标示。':'AI content has been migrated as a sample. Other entries are marked “Not configured”.','打开行业专题 →':'Open industry profile →',
  '中国 GenAI 软件收入':'China GenAI software revenue','亿美元 · 2024 原文数据':'USD · 2024 source data','原站市场统计':'Original site statistic','湖北 AI 骨干企业位次':'Hubei AI company ranking','原文口径：2022':'Source period: 2022','专题列示主体':'Listed organizations','企业与机构':'companies and institutions','档案状态各异，待复核':'Profile status varies; review pending',
  '行业地图':'Industry map','查看行业专题、产业链与企业关系。点击行业进入专题详情；行业之间的关联关系可追溯到已发布内容。':'Explore industry profiles, supply chains and company relationships. Select an industry for its profile and related companies.',
  ' 个示例行业':' sample industries','行业关联关系':'Industry connections','当前关系以人工智能专题为核心；灰绿色节点为待补充完整内容的关联方向。':'AI is the current sample. Related sectors are shown as connections; their full profiles are not yet configured.','关系可由后台维护':'Relationships managed in CMS','已迁入专题':'Migrated profile','当前详细内容聚焦人工智能':'Detailed content currently focuses on AI','→':'→','原专题关联':'Related in source',
  '关联方向 · 内容待配置':'Related sector · Profile pending','行业目录':'Industry directory','行业专题介绍、相关企业和城市关系在行业详情中查看。':'Open an industry to see its profile, companies and city links.',' 个行业条目':' industries','查看行业详情 →':'View industry →',' 个关联条目':' linked records',
  '数字科技':'Digital technology','已迁入示例':'Migrated sample','待配置':'Not configured','关联方向':'Related sector','当前已迁入内容聚焦人工智能专题，包含全国趋势、湖北布局、产业链与原站列示企业。软件与互联网子专题尚未在本演示中展开。':'AI content has been migrated, including national trends, Hubei plans, supply-chain layers and companies. Other software and internet profiles are not yet included.',
  '返回行业地图':'Back to industry map','行业专题':'Industry profile','行业介绍 · 人工智能示例':'Industry overview · AI sample','原站人工智能专题覆盖全国市场趋势、湖北产业规划、产业链层级及代表企业。当前展示的是该行业下已迁入的人工智能内容，软件与互联网其他子专题待后台补充。':'The source AI profile covers market trends, Hubei plans, supply-chain layers and representative companies. Other software and internet profiles are not included in this sample.',
  '全国与湖北布局':'National trends and Hubei plans','原专题称，2024 年中国 GenAI 软件收入为 18 亿美元，并给出 2029 年市场预测。原文引用 2022 年人工智能骨干企业省份分布，湖北位于第二梯队、全国第八。预测与历史数据均非实时信息。':'The source reported China’s 2024 GenAI software revenue at USD 1.8 billion and forecast market growth through 2029. Its 2022 distribution of leading AI companies ranked Hubei eighth nationally. Historical data and forecasts are not live information.',
  '湖北规划方向为“一主引领、两翼驱动、全域协同”：以武汉为核心，支持襄阳、宜昌发展差异化、特色化应用服务体系。':'The source plan describes “one core, two wings, coordinated development”: Wuhan as the core, with differentiated applications in Xiangyang and Yichang.',
  '来源：湖北产业知识库原站人工智能专题。原文数据口径、有效期及预测需上线前复核。':'Source: AI profile on the original Hubei Industry Knowledge Base. Verify data definitions, validity and forecasts before publication.',
  '专题数据':'Profile data','中国 GenAI 软件收入（2024，原文）':'China GenAI software revenue (2024, source)','湖北全国第 8':'Hubei ranked #8 nationally','人工智能骨干企业分布（2022，原文口径）':'Leading AI companies (2022 source definition)',' 个':'','原站列示企业与产业机构':'companies and institutions listed in the source','相关城市':'Related cities',
  '产业链':'Supply chain','基础层 → 技术层 → 应用层':'Infrastructure → Technology → Applications','基础层':'Infrastructure layer','技术层':'Technology layer','应用层':'Application layer','上游 · 算力与硬件':'Upstream · Compute and hardware','中游 · 算法与模型':'Midstream · Algorithms and models','下游 · 场景应用':'Downstream · Applications',
  'AI 芯片、传感器、服务器、云计算和数据算力。原专题提及武汉先进算力中心、宜昌“存算一体”数据中心集群。':'AI chips, sensors, servers, cloud computing and data infrastructure. The source mentions Wuhan’s advanced computing center and Yichang’s compute-storage data center cluster.',
  '算法、模型与框架研发；原专题提出智能软硬件、多模态通用大模型、类脑智能、群体智能与智能芯片等方向。':'Algorithms, models and frameworks. The source highlights intelligent hardware and software, multimodal models, brain-inspired and swarm intelligence, and AI chips.',
  '智能驾驶、智能座舱、智慧医疗、机器人、智慧城市与智能制造等应用方向。':'Applications include intelligent driving and cockpits, smart healthcare, robotics, smart cities and manufacturing.',
  '相关企业与机构':'Related companies and organizations','企业详情中可查看档案、领域和城市关系。':'Open a company profile to see its business and city links.','进入企业库 →':'Browse companies →','点击公司可看已迁入档案；未完成资料的企业明确标为待补充，不补写未知信息。':'Select a company to view its migrated profile. Missing information is marked rather than inferred.',
  '专题内容状态':'Profile status','此行业目前作为关系图中的关联节点展示。':'This sector currently appears as a related node in the industry map.','原站人工智能专题曾提及此关联方向，但本演示尚未迁入该行业的独立介绍、产业链和审核后的企业关系。正式内容应由后台补充来源、更新时间并审核发布。':'The original AI profile mentions this related sector, but its standalone overview, supply chain and reviewed company relationships have not been migrated. Add sources and review the content in the CMS before publication.','原站人工智能专题列示的关联方向，当前迁入企业名称与领域标签；详细介绍、来源和更新时间待后台补全。':'Related to the original AI profile. Company descriptions, sources and update dates still need to be completed in the CMS.','当前可确认的关联条目':'Currently linked records','行业关系待确认':'Industry link pending confirmation','当前列表迁自原站人工智能专题。未补充完整档案的条目会明确标记待核验，不会自动推测企业介绍或所在地。':'This directory is migrated from the original AI profile. Unverified descriptions and locations are not inferred.',
  '行业地图':'Industry map','按城市查看产业规划、重点方向与已关联企业。没有来源支持的企业关系会明确留空，不做猜测。':'Explore city plans, key sectors and linked companies. Unsupported company links are left blank.',
  '城市地图':'City map',' 个示例城市':' sample cities','一主引领 · 原站规划摘录':'Core city · Source plan excerpt','两翼驱动 · 原站规划摘录':'Regional wing · Source plan excerpt','查看城市详情 →':'View city →',' 个已关联企业':' linked companies','企业待关联':'Company links pending',
  '城市示例来自原站人工智能专题中的规划与产业链描述。这里只录入来源明确的内容；其他城市与企业可在后台配置。':'City examples are based on plans and supply-chain information in the original AI profile. Other cities and company links can be configured in the CMS.',
  '城市专题':'City profile','重点行业与产业方向':'Key industries and sectors','来源中提及的布局':'Plans mentioned in the source','原站内容 ':'Source item ','湖北产业知识库原站人工智能专题；设施建设与运营主体需上线前核实。':'Source: original Hubei Industry Knowledge Base AI profile. Verify facility status and operators before publication.','湖北产业知识库原站人工智能专题；未迁入具体项目和企业清单。':'Source: original Hubei Industry Knowledge Base AI profile. Specific projects and company lists have not been migrated.','只列出已有来源明确关联到此城市的企业。':'Only companies with a clear source linking them to this city are shown.','暂无已审核并关联到该条目的企业档案。编辑人员可在后台补充关系后发布。':'No reviewed company profiles are linked to this entry yet. Editors can add and publish relationships in the CMS.',
  '企业库':'Company directory','查看企业档案及其所属行业、所在城市。企业与城市的关系均以后台审核后的关联为准。':'Explore company profiles, industries and locations. Company-city links are shown only after review.',' 个迁移条目':' migrated records','搜索企业':'Search companies','搜索企业名称、领域或城市':'Search by company, sector or city',' 个匹配':' matches',' 个条目':' records','没有匹配的企业。':'No matching companies.','企业名称迁自原站人工智能专题。除有完整档案的条目外，其余企业详细介绍、来源和更新时间待后台补充与审核。':'Company names are migrated from the original AI profile. Other descriptions, sources and update dates need CMS review.',
  '返回企业库':'Back to company directory','企业档案':'Company profile','原站人工智能专题列示':'Listed in original AI profile','企业介绍':'Company overview','原站专题列示了该企业名称或方向。本演示未迁入经核验的完整企业介绍，避免补写未经确认的事实。':'The original profile lists this company or sector. A verified full description has not been migrated, so no details are inferred.','来源：湖北产业知识库原站人工智能专题企业列表/档案。原文中的市场、上市和技术信息均需在正式发布前复核。':'Source: company listing/profile in the original Hubei Industry Knowledge Base AI page. Verify market, listing and technology details before publication.','关联关系':'Relationships','所属行业':'Industry','所在城市':'City','资料状态':'Content status','原站迁移样例 · 待核验':'Migrated source sample · Verification pending','待核验后关联':'Link after verification',
  '演示回答 · 基于本站迁入资料':'Demo reply · Based on migrated site content','固定演示内容 · 正式版由站内检索 + LLM 生成，并经引用校验':'Fixed demo reply · Production answers will use site search, an LLM and citation checks','来源：':'Source: ','人工智能专题':'AI profile','行业详情':'Industry details','城市详情':'City details','浏览行业':'Browse industries','浏览城市':'Browse cities','浏览企业':'Browse companies',
  '原站人工智能专题将产业链分为基础层、技术层和应用层。基础层包括 AI 芯片、传感器、服务器、云计算和数据算力；原文提到武汉先进算力中心、宜昌“存算一体”数据中心集群。相关设施与企业信息均需结合原文时间口径复核。':'The source AI profile divides the supply chain into infrastructure, technology and application layers. Infrastructure includes AI chips, sensors, servers, cloud computing and data infrastructure. It mentions Wuhan’s advanced computing center and Yichang’s compute-storage data center cluster. Verify facility and company details against the source date.',
  '原专题提出支持宜昌发展差异化、特色化应用服务体系，并提及宜昌“存算一体”数据中心集群。当前示例未确认相关企业主体。':'The source plan supports differentiated applications in Yichang and mentions a compute-storage data center cluster. Related company operators have not been confirmed in this demo.',
  '原专题提出支持襄阳发展差异化、特色化应用服务体系。当前示例没有迁入襄阳相关企业档案。':'The source plan supports differentiated applications in Xiangyang. Company profiles for Xiangyang have not been migrated in this demo.',
  '原专题提出以武汉为核心，依托东湖新技术开发区在光电子信息、生物健康、智能产业等方面的基础，打造人工智能创新策源地和产业集聚基地。':'The source plan places Wuhan at the core, building on the East Lake High-tech Development Zone’s strengths in optoelectronics, biomedicine and intelligent industries as an AI innovation and industry hub.',
  '差异化、特色化应用服务体系（原站规划表述）':'Differentiated application services (source plan)','“存算一体”数据中心集群（原站专题提及）':'Compute-storage data center cluster (mentioned in source)',
  '力源信息':'Wuhan P&S Information Technology','黑芝麻智能科技有限公司':'Black Sesame Technologies','黑芝麻智能':'Black Sesame Technologies','三峡集团数据中心':'China Three Gorges Data Center','中科曙光智算中心':'Sugon Intelligent Computing Center','思朗科技（湖北）有限公司':'Silan Microelectronics (Hubei) Co., Ltd.','大势智慧':'Datu Wisdom','超擎数智':'Chaoqing Digital Intelligence','讯飞华中':'iFLYTEK Central China','明德生物':'Minde Bio','福鑫科创':'Fuxin Technology','兰丁智能医学':'Landing Medical','电子元器件':'Electronic components','车规级智能汽车计算芯片':'Automotive-grade intelligent computing chips','数据中心与算力基础设施':'Data centers and computing infrastructure','智能算力基础设施':'Intelligent computing infrastructure','产业应用':'Industry applications','语音与模型':'Speech and models','医疗应用':'Healthcare applications','智能医学':'AI-enabled medicine','武汉':'Wuhan','襄阳':'Xiangyang','宜昌':'Yichang',
  '成立于2016年':'founded in 2016','公司专注于自动驾驶、智能座舱、先进成像及互联等领域。':'The company focuses on autonomous driving, smart cockpits, advanced imaging and connectivity.','原页面记载公司于2024年在香港交易所主板挂牌上市，股票代码2533.HK。':'The source states that the company listed on the Main Board of the Hong Kong Stock Exchange in 2024 (2533.HK).','智能汽车业务':'Intelligent automotive business','公司基于华山系列和武当系列车规级 SoC 芯片，提供自动驾驶、智能座舱等解决方案。原文称，截至2023年12月31日，华山A1000系列SoC总出货量超过15.2万片。':'The company offers autonomous-driving and smart-cockpit solutions based on its Huashan and Wudang automotive SoCs. The source reports over 152,000 Huashan A1000 SoCs shipped as of December 31, 2023.','智能影像与车路协同':'Intelligent imaging and vehicle-infrastructure collaboration','原文介绍其车规级图像处理核心、视觉感知技术与 DynamAI NN 引擎，支持车路协同解决方案。':'The source describes its automotive image-processing core, visual perception technology and DynamAI NN engine for vehicle-infrastructure collaboration.','技术介绍':'Technology overview','原文介绍华山A2000家族搭载自研“九韶”NPU架构。产品性能与当前状态均未在本原型中独立验证。':'The source says the Huashan A2000 family uses its proprietary Jiushou NPU architecture. Product performance and current status have not been independently verified in this demo.',
  '返回':'Back',' 资料来源':' Sources','Industry directory':'Industry directory','CITY MAP':'CITY MAP','COMPANY DIRECTORY':'COMPANY DIRECTORY','INDUSTRY MAP':'INDUSTRY MAP','Migrated content sample':'Migrated content sample','Traceability':'Traceability','Market & Hubei':'Market & Hubei','Value chain':'Value chain',
  '你可以试着问':'Try asking','智能AI':'Smart AI','你好，我是湖北产业助手。可以问我行业趋势、产业链关系、城市布局或企业信息。':'Hello, I’m the Hubei Industry Assistant. Ask me about industry trends, supply chains, city clusters or companies.','湖北产业助手':'Hubei Industry Assistant','站内知识库 · 来源可追溯':'Site knowledge · Traceable sources','资料助手':'Knowledge assistant','输入你想了解的产业问题…':'Ask about an industry…','提问':'Send','仅依据本站已审核资料回答 · 不连接外网搜索':'Answers use reviewed site content only · No web search','AI 问答':'AI Assistant','AI产业?':'',
  '湖北人工智能产业链上游有哪些方向？':'What are the upstream sectors of Hubei’s AI industry?','武汉有哪些人工智能产业布局？':'What AI industry plans are mentioned for Wuhan?','黑芝麻智能是什么企业？':'What does Black Sesame Technologies do?','宜昌有哪些人工智能相关内容？':'What AI-related information is available for Yichang?',
  '在原站人工智能专题中列示，领域标签为':'is listed in the source AI profile under','。':' . ','的':'of','你好':'Hello','仅依据本站':'Based on reviewed site content only',
  '行业关联关系':'Industry connections','行业目录':'Industry directory','城市地图':'City map','查看企业详情 →':'View company profile →','企业资料':'Company information','行业专题 · 数字科技':'Industry profile · Digital technology',
  '武汉 · 车规级智能汽车计算芯片':'Wuhan · Automotive-grade intelligent computing chips','原站人工智能专题企业列表/档案':'Company listing/profile in original AI industry page',
  '黑芝麻智能科技有限公司成立于2016年，总部位于湖北武汉，是一家车规级智能汽车计算芯片及基于芯片的解决方案供应商。公司专注于自动驾驶、智能座舱、先进成像及互联等领域。原页面记载公司于2024年在香港交易所主板挂牌上市，股票代码2533.HK。':'Black Sesame Technologies was founded in 2016 and is headquartered in Wuhan, Hubei. It provides automotive-grade intelligent computing chips and related solutions, focusing on autonomous driving, smart cockpits, advanced imaging and connectivity. The source states that it listed on the Main Board of the Hong Kong Stock Exchange in 2024 (2533.HK).',
  '原站人工智能专题列示企业，当前迁入企业名称与领域标签；详细介绍、来源和更新时间待后台补全。':'Listed in the original AI profile. The company name and sector have been migrated; its description, sources and update date need to be completed in the CMS.',
  '原站人工智能专题列示的产业机构/项目主体。具体规范名称、所在地、建设运营关系与企业档案待核验。':'Listed as an organization/project in the original AI profile. Its official name, location, operator and profile need verification.',
  '原站人工智能专题列示主体。项目所在地、运营主体和具体业务档案待补充来源后确认。':'Listed in the original AI profile. The project location, operator and business details need sourced confirmation.',
  '原站人工智能专题列示企业，详细档案待后台补全与审核。':'Listed in the original AI profile. A detailed, reviewed profile is pending in the CMS.',
  '原站人工智能专题列示企业/机构，规范主体名称与详细档案待后台核验。':'Listed in the original AI profile. Its official entity name and detailed profile need CMS verification.',
  '原站人工智能专题列示企业，详细介绍、来源和更新时间待后台补充。':'Listed in the original AI profile. Its description, sources and update date need completion in the CMS.',
  '湖北产业知识库原站人工智能专题；规划与设施信息需核验当前状态。':'Source: original Hubei Industry Knowledge Base AI profile. Verify current plan and facility status.',
  '在本演示中':'in this demo','待后台配置':'CMS configuration pending','待后台补充':'CMS completion pending','点击行业进入专题详情；行业之间的关联关系可追溯到已发布内容。':'Select an industry to open its profile. Industry relationships link to published content.',
  '原文提及':'Mentioned in source','原文数据':'source data','相关行业':'Related industries','区域规划':'Regional plan','回到':'Back to','关闭':'Close','来源与时间':'Sources and dates','关联：':'Related: ','关联行业':'Related industries','← 返回城市地图':'← Back to city map','← 返回行业地图':'← Back to industry map','← 返回企业库':'← Back to company directory','城市专题 · 湖北':'City profile · Hubei','相关企业':'Related companies','18 亿美元':'USD 1.8 billion','11 个':'11','芯片':'chips','湖北':'Hubei','从当前专题继续浏览相邻产业方向。':'Explore related industries from this profile.','发送问题':'Send question',
  '你可以试着问':'Try asking','你好，我是湖北产业助手。可以问我行业趋势、产业链关系、城市布局或企业信息。':'Hello, I’m the Hubei Industry Assistant. Ask me about industry trends, supply chains, city clusters or companies.','站内知识库 · 来源可追溯':'Site knowledge · Traceable sources','资料助手':'Knowledge assistant','输入你想了解的产业问题…':'Ask about an industry…','仅依据本站已审核资料回答 · 不连接外网搜索':'Answers use reviewed site content only · No web search',
  '当前行业':'Current industry','查看城市地图':'View city map','行业关联':'Industry connections','来源可追溯':'Traceable sources','原站文案':'Original source text','待核验':'Verification pending','当前迁入内容聚焦人工智能专题':'Migrated content currently focuses on the AI profile','详细介绍、来源和更新时间待后台补全。':'Descriptions, sources and update dates need CMS completion.','查看人工智能内容样例 ↓':'View AI content sample ↓','演示数据':'Demo content','正式接入由后台配置':'Production content is managed in a separate CMS','行业专题 · 数字科技':'Industry profile · Digital technology','武汉 · 车规级智能汽车计算芯片':'Wuhan · Automotive-grade intelligent computing chips',
  '原站人工智能专题列示企业与机构':'Companies and organizations listed in the original AI profile','湖北产业知识库原站「软件、互联网与人工智能 / 人工智能」专题':'AI profile under Software, Internet and Artificial Intelligence on the original Hubei Industry Knowledge Base','数据来源、时间与审核状态可追溯':'Sources, dates and review status are traceable',
  '力源信息':'Wuhan P&S Information Technology','黑芝麻智能科技有限公司':'Black Sesame Technologies','黑芝麻智能':'Black Sesame Technologies','三峡集团数据中心':'China Three Gorges Data Center','中科曙光智算中心':'Sugon Intelligent Computing Center','思朗科技（湖北）有限公司':'Silan Microelectronics (Hubei) Co., Ltd.','大势智慧':'Datu Wisdom','超擎数智':'Chaoqing Digital Intelligence','讯飞华中':'iFLYTEK Central China','明德生物':'Minde Bio','福鑫科创':'Fuxin Technology','兰丁智能医学':'Landing Medical',
  '电子元器件':'Electronic components','车规级智能汽车计算芯片':'Automotive-grade intelligent computing chips','数据中心与算力基础设施':'Data centers and computing infrastructure','智能算力基础设施':'Intelligent computing infrastructure','产业应用':'Industry applications','语音与模型':'Speech and models','医疗应用':'Healthcare applications','智能医学':'AI-enabled medicine','武汉':'Wuhan','襄阳':'Xiangyang','宜昌':'Yichang',
  '原专题提出支持宜昌发展差异化、特色化应用服务体系，并提及宜昌“存算一体”数据中心集群。当前示例未确认相关企业主体。':'The source plan supports differentiated applications in Yichang and mentions a compute-storage data center cluster. Related company operators have not been confirmed in this demo.',
  '原专题提出支持襄阳发展差异化、特色化应用服务体系。当前示例没有迁入襄阳相关企业档案。':'The source plan supports differentiated applications in Xiangyang. Company profiles for Xiangyang have not been migrated in this demo.',
  '原专题提出以武汉为核心，依托东湖新技术开发区在光电子信息、生物健康、智能产业等方面的基础，打造人工智能创新策源地和产业集聚基地。':'The source plan places Wuhan at the core, building on the East Lake High-tech Development Zone’s strengths in optoelectronics, biomedicine and intelligent industries as an AI innovation and industry hub.',
  '差异化、特色化应用服务体系（原站规划表述）':'Differentiated application services (source plan)','“存算一体”数据中心集群（原站专题提及）':'Compute-storage data center cluster (mentioned in source)',
  '黑芝麻智能科技有限公司成立于2016年，总部位于湖北武汉，是一家车规级智能汽车计算芯片及基于芯片的解决方案供应商。公司专注于自动驾驶、智能座舱、先进成像及互联等领域。原页面记载公司于2024年在香港交易所主板挂牌上市，股票代码2533.HK。':'Black Sesame Technologies was founded in 2016 and is headquartered in Wuhan, Hubei. It provides automotive-grade intelligent computing chips and related solutions, focusing on autonomous driving, smart cockpits, advanced imaging and connectivity. The source states that it listed on the Main Board of the Hong Kong Stock Exchange in 2024 (2533.HK).',
  '原站人工智能专题列示企业，当前迁入企业名称与领域标签；详细介绍、来源和更新时间待后台补全。':'Listed in the original AI profile. The company name and sector have been migrated; its description, sources and update date need to be completed in the CMS.',
  '原站人工智能专题列示的产业机构/项目主体。具体规范名称、所在地、建设运营关系与企业档案待核验。':'Listed as an organization/project in the original AI profile. Its official name, location, operator and profile need verification.',
  '原站人工智能专题列示主体。项目所在地、运营主体和具体业务档案待补充来源后确认。':'Listed in the original AI profile. The project location, operator and business details need sourced confirmation.',
  '原站人工智能专题列示企业，详细档案待后台补全与审核。':'Listed in the original AI profile. A detailed, reviewed profile is pending in the CMS.',
  '原站人工智能专题列示企业/机构，规范主体名称与详细档案待后台核验。':'Listed in the original AI profile. Its official entity name and detailed profile need CMS verification.',
  '原站人工智能专题列示企业，详细介绍、来源和更新时间待后台补充。':'Listed in the original AI profile. Its description, sources and update date need completion in the CMS.',
  '行业关联关系':'Industry connections','行业目录':'Industry directory','城市地图':'City map','查看企业详情 →':'View company profile →','企业资料':'Company information','Industry directory':'Industry directory','CITY MAP':'CITY MAP','COMPANY DIRECTORY':'COMPANY DIRECTORY','INDUSTRY MAP':'INDUSTRY MAP','Migrated content sample':'Migrated content sample','Traceability':'Traceability','Market & Hubei':'Market & Hubei','Value chain':'Value chain',
  '软件、互联网与人工智能':'Software, Internet and Artificial Intelligence','半导体与智能芯片':'Semiconductors and AI Chips','算力与数据中心':'Computing and Data Centers','智能驾驶与车路协同':'Intelligent Driving and V2X','智慧医疗':'Smart Healthcare',
  '原站人工智能专题提及的关联方向。独立行业介绍、产业链、企业关系与城市覆盖尚未迁入。':'A related sector mentioned in the original AI profile. Its standalone overview, supply chain, company links and city coverage have not yet been migrated.',
  '原站人工智能专题提及的基础设施方向。独立行业介绍与主体关系尚未迁入。':'An infrastructure sector mentioned in the original AI profile. Its standalone overview and entity relationships have not yet been migrated.',
  '原站人工智能专题提及的应用方向。独立行业介绍与企业关系尚未迁入。':'An application sector mentioned in the original AI profile. Its standalone overview and company relationships have not yet been migrated.',
  '原站人工智能专题提及的应用方向。独立行业介绍和企业关系尚未迁入。':'An application sector mentioned in the original AI profile. Its standalone overview and company relationships have not yet been migrated.',
  '当前已迁入内容聚焦人工智能专题，包含全国趋势、湖北布局、产业链与原站列示企业。软件与互联网子专题尚未在本演示中展开。':'Migrated content focuses on the AI profile, including national trends, Hubei plans, supply-chain layers and listed companies. Other software and internet profiles are not included in this demo.',
  '原专题人工智能专题曾提及此关联方向，当前迁入企业名称与领域标签；详细介绍、来源和更新时间待后台补全。':'This related sector is mentioned in the original AI profile. Company names and sector labels are migrated; descriptions, sources and update dates need CMS completion.',
  '原站专题列示的企业与机构。详细介绍、来源和更新时间待后台补充。':'Companies and organizations listed in the source profile. Descriptions, sources and update dates need CMS completion.',
  '原专题提及的基础设施方向，独立行业介绍与主体关系尚未迁入。':'An infrastructure sector mentioned in the source profile. Its standalone overview and entity relationships have not yet been migrated.',
  '原专题提及的应用方向，独立行业介绍与企业关系尚未迁入。':'An application sector mentioned in the source profile. Its standalone overview and company relationships have not yet been migrated.',
  ' 个关联条目':' linked records','关系可由后台维护':'Relationships managed in CMS','当前详细内容聚焦人工智能':'Detailed content currently focuses on AI','已迁入专题':'Migrated profile','原专题关联':'Related in source','行业专题介绍、相关企业和城市关系在行业详情中查看。':'Open an industry to see its profile, companies and city links.',
  '人工智能':'Artificial Intelligence','湖北人工智能':'Hubei AI','人工智能产业链':'AI supply chain','查看':'View','待关联':'Link pending','已关联企业':'linked companies','原站规划摘录':'Source plan excerpt','原站人工智能专题中的规划与产业链描述。':'plans and supply-chain information in the original AI profile.',
  '公司专注于自动驾驶、智能座舱、先进成像及互联等领域。':'The company focuses on autonomous driving, smart cockpits, advanced imaging and connectivity.',
  '公司基于华山系列和武当系列车规级 SoC 芯片，提供自动驾驶、智能座舱等解决方案。原文称，截至2023年12月31日，华山A1000系列SoC总出货量超过15.2万片。':'The company offers autonomous-driving and smart-cockpit solutions based on its Huashan and Wudang automotive SoCs. The source reports over 152,000 Huashan A1000 SoCs shipped as of December 31, 2023.',
  '原文介绍其车规级图像处理核心、视觉感知技术与 DynamAI NN 引擎，支持车路协同解决方案。':'The source describes its automotive image-processing core, visual perception technology and DynamAI NN engine for vehicle-infrastructure collaboration.',
  '原文介绍华山A2000家族搭载自研“九韶”NPU架构。产品性能与当前状态均未在本原型中独立验证。':'The source says the Huashan A2000 family uses its proprietary Jiushou NPU architecture. Product performance and current status have not been independently verified in this demo.'
};

Object.assign(english,{
  '探索地图':'Explore Map','黄石':'Huangshi','十堰':'Shiyan','鄂州':'Ezhou','荆门':'Jingmen','孝感':'Xiaogan',
  '荆州':'Jingzhou','黄冈':'Huanggang','咸宁':'Xianning','随州':'Suizhou','恩施州':'Enshi',
  '仙桃':'Xiantao','潜江':'Qianjiang','天门':'Tianmen','神农架林区':'Shennongjia Forestry District',
  '该城市专题资料待补充，当前暂未关联已审核的行业与企业信息。':'City profile content is pending. No reviewed industry or company information is linked yet.',
  '湖北省 · 内容待配置':'Hubei · Content pending',
  '城市专题资料待后台补充与审核。':'City profile content needs to be added and reviewed in the CMS.',
  '城市介绍内容待补充，可在此添加城市概况与发展情况。':'City overview content is pending and can be added here.',
  '探索湖北城市':'Explore Hubei Cities','点击地图区域或右侧城市名称，查看对应城市专题。':'Select a region on the map or a city on the right to open its profile.',
  '17个市州':'17 prefecture-level regions','全部城市均可探索':'All regions available','湖北城市地图':'Hubei City Map',
  '目录':'Directory','关于':'About','政策':'Policies','查看更多政策':'View all policies','查看更多企业':'View all companies',
  '政策目录':'Policy directory','政策样例':'Policy samples','企业样例':'Company samples','政策层级':'Policy level',
  '发布单位':'Issuing body','时间':'Date','政策类别':'Policy category','关联一级行业':'Related primary industry',
  '光通信分册':'Optical communications supplement','待核验':'Pending verification',
  '来源：用户提供的光通信分册政策附录。仅迁入名称与元数据，政策原文及现行有效性待核验。':'Source: the supplied optical communications policy supplement. Only titles and metadata are migrated; full text and current validity need verification.',
  '来源：用户提供的光通信分册企业附录。仅迁入企业名称与行业分类，详细介绍及关系待补充审核。':'Source: the supplied optical communications company supplement. Only company names and sector classifications are migrated; profiles and relationships need review.',
  '该条目目前仅包含政策名称与附录元数据，政策原文、摘要和现行有效性需进一步核验。':'This entry currently contains only the title and appendix metadata. The full text, summary and current validity require further review.',
  '该企业目前仅迁入名称与行业分类，详细介绍、来源和关联关系需补充审核。':'Only the company name and sector classification have been migrated. Its profile, sources and relationships need review.'
});

function translateText(text){
  if(language==='zh')return text;
  if(english[text])return english[text];
  let output=text;
  for(const [source,target] of Object.entries(english).sort((a,b)=>b[0].length-a[0].length))if(source.length>1&&output.includes(source))output=output.replaceAll(source,target);
  return output;
}

function applyLanguage(){
  document.documentElement.lang=language==='en'?'en':'zh-CN';
  const languageLabel=document.querySelector('#languageLabel');
  languageLabel.textContent=language==='en'?'EN':'简体中文';
  document.querySelector('#languageTrigger').setAttribute('aria-label',language==='en'?'Language: English':'语言：简体中文');
  document.querySelector('#languageOptions').setAttribute('aria-label',language==='en'?'Page language':'网页语言');
  document.querySelectorAll('#languageOptions [data-language]').forEach(option=>option.setAttribute('aria-selected',String(option.dataset.language===language)));
  window.updateSiteNavigation(language);
  document.querySelector('.main-nav').setAttribute('aria-label',language==='en'?'Knowledge base navigation':'知识库导航');
  document.querySelector('.explorer-sidebar')?.setAttribute('aria-label',language==='en'?'Choose a dimension':'选择探索维度');
  document.querySelector('.main-nav [data-home-directory]').textContent=language==='en'?'Industry Directory':'产业目录';
  document.querySelector('.main-nav a[data-section="explore-map"]').textContent=language==='en'?'Explore Map':'探索地图';
  document.querySelector('.main-nav a[data-section="explore-stars"]').textContent=language==='en'?'Explore Stars':'探索星图';
  document.querySelector('.main-nav a[data-section="new-materials"]').textContent=language==='en'?'Introduction':'简介';
  document.querySelectorAll('.shortcut-icon').forEach((icon,index)=>{icon.textContent=language==='en'?['I','C','Co'][index]:['行','城','企'][index]});
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const textNodes=[];while(walker.nextNode())textNodes.push(walker.currentNode);
  for(const node of textNodes){if(node.parentElement?.closest('[data-preserve-text]'))continue;const original=node.nodeValue;const trimmed=original.trim();if(!trimmed)continue;const leading=original.match(/^\s*/)?.[0]||'';const trailing=original.match(/\s*$/)?.[0]||'';node.nodeValue=leading+translateText(trimmed)+trailing}
  for(const element of document.querySelectorAll('input[placeholder],button[title],a[aria-label]')){
    for(const attribute of ['placeholder','title','aria-label'])if(element.hasAttribute(attribute))element.setAttribute(attribute,translateText(element.getAttribute(attribute)));
  }
  const sendButton=document.querySelector('#askForm button[type="submit"]');
  if(sendButton)sendButton.setAttribute('aria-label',language==='en'?'Send question':'提问');
  for(const element of document.querySelectorAll('[data-question]'))element.dataset.question=translateText(element.dataset.question);
  const pageSection=routeParts()[0];
  const pageNames=language==='en'?{home:'Home','home-directory':'Industry Directory',assistant:'AI Assistant','explore-map':'Explore Map','explore-stars':'Explore Stars',industries:'Industry map',industry:'Industry profile',cities:'City map',city:'City profile','new-materials':'Introduction',companies:'Company directory',company:'Company profile',policies:'Policy directory',policy:'Policy profile'}:{home:'首页','home-directory':'产业目录',assistant:'AI问答','explore-map':'探索地图','explore-stars':'探索星图',industries:'行业地图',industry:'行业专题',cities:'城市地图',city:'城市专题','new-materials':'简介',companies:'企业库',company:'企业详情',policies:'政策目录',policy:'政策详情'};
  document.title=`${language==='en'?'Hubei Industry Knowledge Base':'湖北产业知识库'} · ${pageNames[pageSection]||pageNames.home}`;
}

function companyById(id){return companies.find(company=>company.id===id)}
function industryById(id){
  const aliases={semiconductor:'tmt-semiconductors',compute:'compute-servers'};
  const industryId=aliases[id]||id;
  const primary=industryStarGroups.find(group=>group.industryId===industryId);
  if(primary){
    const name=language==='en'?primary.nameEn:primary.name;
    return {id:industryId,name,nameEn:primary.nameEn,category:language==='en'?'Primary industry':'一级行业',status:language==='en'?'Primary industry':'一级行业',intro:language==='en'?`${name} includes ${primary.satellites.length} mapped secondary industries. Open a secondary profile to explore its available information.`:`${name}是湖北产业分类中的一级行业，旗下收录${primary.satellites.length}个二级行业，可进入具体专题查看。`,related:primary.satellites.map(satellite=>satellite[0]),children:primary.satellites.map(satellite=>industryById(satellite[0])),companies:[],starLevel:'primary',source:primary.source};
  }
  const parent=industryStarGroups.find(group=>group.satellites.some(satellite=>satellite[0]===industryId));
  const satellite=parent?.satellites.find(item=>item[0]===industryId);
  if(satellite){
    const configured=industries.find(industry=>industry.id===industryId);
    const name=language==='en'?satellite[2]:satellite[1];
    return {...configured,id:industryId,name,nameEn:satellite[2],category:language==='en'?parent.nameEn:parent.name,status:configured?.sourceId?(language==='en'?'Source profile imported':'原站图文已收录'):configured?.status||(language==='en'?'Pending configuration':'待后台配置'),intro:language==='en'?(configured?.introEn||`${name} is listed under ${parent.nameEn}. Detailed profile information is pending configuration.`):(configured?.intro||`原站将「${name}」归入「${parent.name}」。专题介绍及关联资料待后台配置。`),related:configured?.related||[parent.industryId],companies:configured?.companies||[],starLevel:'secondary',parentId:parent.industryId,parentName:language==='en'?parent.nameEn:parent.name,source:configured?.source};
  }
  return industries.find(industry=>industry.id===industryId);
}
function cityById(id){return cities.find(city=>city.id===id)}
function mapCityName(unit){return language==='en'?(mapCityNamesEn[unit.id]||unit.name):unit.name}
function companySymbol(company){return language==='en'?({'force-info':'P&S','black-sesame':'BS','three-gorges-data':'TG','sugon-center':'SC','silan-hubei':'SM','daji':'DW','chaoqing':'CD','iflytek-central':'iF','mindray':'MB','fuxin':'FX','landing-med':'LM'}[company.id]||company.symbol):company.symbol}
function opticalCompanies(){return companies.filter(company=>company.sourceKey==='optical-comms')}
function opticalCategoryLabel(category){return language==='en'?({'光模块':'Optical modules','光纤':'Optical fiber','光交换机':'Optical switches','激光宏加工':'Laser macro-processing','激光微加工':'Laser micro-processing','激光雷达':'LiDAR','激光卫星':'Laser satellites','其他激光':'Other laser applications'}[category]||category):category}
function routeParts(){const parts=decodeURIComponent(location.hash.slice(1)||'home').split('/');return parts[0]==='ai'?['assistant',...parts.slice(1)]:parts}
function scrollHomeDirectory(){const section=document.querySelector('#homeDirectory');if(!section)return;const headerHeight=document.querySelector('.site-header')?.getBoundingClientRect().height||0;const top=window.scrollY+section.getBoundingClientRect().top-headerHeight-12;window.scrollTo({top:Math.max(0,top),behavior:'smooth'})}
function linkTo(route,label,className='text-link'){return `<a class="${className}" href="#${route}">${label}</a>`}
function backLink(route,label){return `<div class="detail-top">${linkTo(route,`← ${label}`,'back-link')}</div>`}
function previousBackLink(label,fallbackRoute='home-directory'){return `<div class="detail-top"><a class="back-link" href="#${fallbackRoute}" data-history-back data-history-fallback="${fallbackRoute}">← ${label}</a></div>`}
function header(kicker,title,description,badge=''){return `<div class="view-head"><div>${kicker?`<div class="view-kicker">${kicker}</div>`:''}<h1>${title}</h1><p>${description}</p></div>${badge?`<span class="status-badge">${badge}</span>`:''}</div>`}
function companyCard(company){const field=language==='en'&&company.fieldEn?company.fieldEn:company.field;return `<a class="company-item" href="#company/${company.id}"><span class="company-avatar">${escapeText(companySymbol(company))}</span><span class="company-copy"><b data-preserve-text>${escapeText(company.name)}</b><small data-preserve-text>${escapeText(field)}${company.city?` · ${escapeText(company.city)}`:''}</small>${company.sourceId?`<span class="company-source-record">${language==='en'?'Source':'原站'} #${company.sourceId}</span>`:''}${company.sourceKey==='optical-comms'?`<span class="company-tags">${company.tags.map(tag=>`<i>${escapeText(opticalCategoryLabel(tag))}</i>`).join('')}</span>`:''}</span><span class="item-arrow">›</span></a>`}
function companyCards(ids){const selected=ids.map(companyById).filter(Boolean);return selected.length?`<div class="company-grid">${selected.map(companyCard).join('')}</div>`:`<div class="empty-state">原站暂无此项关联企业档案。</div>`}
function industryCard(industry){const linkedLabel=language==='en'?'secondary industries':'个二级行业';return `<a class="explore-card directory-card industry-primary-card" href="#industry/${industry.id}"><span class="policy-card-kicker">${language==='en'?'PRIMARY INDUSTRY':'一级行业'}</span><strong>${industry.name}</strong><p>${industry.intro}</p><span class="explore-card-bottom"><small>${industry.children.length} ${linkedLabel}</small><b aria-hidden="true">↗</b></span></a>`}
function secondaryIndustryCard(industry){return `<a class="explore-card directory-card industry-secondary-card" href="#industry/${industry.id}"><span class="policy-card-kicker">${language==='en'?'SECONDARY INDUSTRY':'二级行业'}</span><strong>${industry.name}</strong><p>${industry.intro}</p><span class="explore-card-bottom"><small>${language==='en'?'View profile':'查看专题'}</small><b aria-hidden="true">↗</b></span></a>`}
function cityCard(city){const companyCount=city.companies.length?(language==='en'?`${city.companies.length} linked ${city.companies.length===1?'company':'companies'}`:`${city.companies.length} 个已关联企业`):(language==='en'?'Company links pending':'企业待关联');const sectorCount=language==='en'?`${city.industries.length} key industries`:`${city.industries.length} 个重点行业`;return `<a class="explore-card directory-card city-directory-card" href="#city/${city.id}"><strong>${city.name}</strong><p>${city.intro}</p><div class="city-directory-tags">${city.industries.slice(0,3).map(id=>`<span class="tag">${industryById(id)?.name||''}</span>`).join('')}</div><span class="explore-card-bottom"><small>${sectorCount} · ${companyCount}</small><b aria-hidden="true">↗</b></span></a>`}
function policyCard(policy){const title=language==='en'?policy.nameEn:policy.name;const level=language==='en'?policy.levelEn:policy.level;const category=language==='en'?policy.categoryEn:policy.category;const issuer=language==='en'?policy.issuerEn:policy.issuer;return `<a class="explore-card directory-card policy-directory-card" href="#policy/${policy.id}"><span class="policy-card-kicker">${level} · ${category}</span><strong>${title}</strong><p>${issuer} · ${policy.date}</p><span class="explore-card-bottom"><small>${language==='en'?'Policy sample · Verify':'政策样例 · 待核验'}</small><b aria-hidden="true">↗</b></span></a>`}
function companyListView(query=''){const filtered=companies.filter(company=>`${company.name} ${company.field} ${company.city||''}`.toLowerCase().includes(query.toLowerCase()));return `<div class="filter-row"><input id="companySearch" type="search" placeholder="搜索企业名称、领域或城市" value="${query.replaceAll('"','&quot;')}"><span class="result-count">${filtered.length} 个条目</span></div><div class="company-grid">${filtered.map(companyCard).join('')||'<div class="empty-state">没有匹配的企业。</div>'}</div><div class="source-note">当前列表迁自原站人工智能专题。未补充完整档案的条目会明确标记待核验，不会自动推测企业介绍或所在地。</div>`}

function homeGuidePanel(mode=homeGuideMode){
  const entries={
    industries:industryStarGroups.slice(0,4).map(group=>industryById(group.industryId)),
    cities:cities.filter(city=>city.industries.length>0).slice(0,4),
    policies:policies.slice(0,4),
    companies:companies.filter(company=>company.sourceId).slice(0,4)
  }[mode]||[];
  const moreLinks={industries:['查看更多行业','View all industries','industries'],cities:['查看更多城市','View all cities','cities'],policies:['查看更多政策','View all policies','policies'],companies:['查看更多企业','View all companies','companies']};
  const moreLink=moreLinks[mode]||moreLinks.industries;
  const cards=entries.map(entry=>{
    if(mode==='policies'){
      const title=language==='en'?entry.nameEn:entry.name;
      const level=language==='en'?entry.levelEn:entry.level;
      const category=language==='en'?entry.categoryEn:entry.category;
      const issuer=language==='en'?entry.issuerEn:entry.issuer;
      return `<a class="explore-card directory-card policy-directory-card" href="#policy/${entry.id}"><span class="policy-card-kicker">${level} · ${category}</span><strong>${title}</strong><p>${issuer} · ${entry.date}</p><span class="explore-card-bottom"><small>${language==='en'?'Policy sample · Verify':'政策样例 · 待核验'}</small><b aria-hidden="true">↗</b></span></a>`;
    }
    if(mode==='companies'){
      const field=language==='en'&&entry.fieldEn?entry.fieldEn:entry.field;
      return `<a class="explore-card directory-card company-directory-card" href="#company/${entry.id}"><strong data-preserve-text>${escapeText(entry.name)}</strong><p data-preserve-text>${escapeText(field)}</p><span class="explore-card-bottom"><small>${language==='en'?'Original website profile':'原站企业档案'}</small><b aria-hidden="true">↗</b></span></a>`;
    }
    if(mode==='industries')return industryCard(entry);
    const linkedCount=entry.industries.length;
    const linkedLabel=language==='en'?'key industries':'个重点行业';
    return `<a class="explore-card" href="#city/${entry.id}"><strong>${entry.name}</strong><p>${entry.intro}</p><span class="explore-card-bottom"><small>${linkedCount} ${linkedLabel}</small><b aria-hidden="true">↗</b></span></a>`;
  }).join('');
  return `<div class="guide-heading"><a class="guide-more" href="#${moreLink[2]}">${language==='en'?moreLink[1]:moreLink[0]}<span aria-hidden="true">→</span></a></div><div class="explore-grid">${cards}</div>`;
}

function renderHome(){
  const prompts=['湖北人工智能产业链上游有哪些方向？','武汉有哪些人工智能产业布局？','黑芝麻智能是什么企业？'];
  const heroEyebrow=language==='en'?'HUBEI INDUSTRY ATLAS':'产业 · 城市 · 企业';
  const heroCore=language==='en'?'<span>HUBEI</span><b>Industry<br>Atlas</b>':'<span>湖北</span><b>产业<br>脉络</b>';
  const promptButtons=renderChatDemoPrompt()+prompts.map(prompt=>`<button type="button" data-question="${prompt}">${prompt}</button>`).join('');
  const heroForm=`<form class="${homeChatExpanded?'chat-composer hero-chat-composer':'hero-ask'}" id="askForm"><label class="visually-hidden" for="questionInput">输入产业问题</label><input id="questionInput" name="question" placeholder="${homeChatExpanded?'输入你想了解的产业问题…':'例如：湖北人工智能产业链有哪些重点方向？'}" autocomplete="off"><button type="submit" aria-label="${homeChatExpanded?'发送问题':'开始提问'}"><span>${homeChatExpanded?'发送':'开始提问'}</span><b aria-hidden="true">↑</b></button></form>`;
  const chatSection=homeChatExpanded?`<div class="hero-chat-shell"><div class="chat-header"><span class="chat-assistant-icon">✦</span><span class="chat-title"><b>智能AI</b><small>站内知识库 · 来源可追溯</small></span></div><div class="chat-messages hero-chat-messages" id="chatMessages" role="log" aria-live="polite">${chatHistory.map(renderChatExchange).join('')}</div>${heroForm}</div>`:`${heroForm}<div class="hero-suggestions" aria-label="${language==='en'?'Example questions':'示例问题'}">${promptButtons}</div>`;
  const heroTitle=homeChatExpanded?`<div class="hero-chat-title"><span class="hero-eyebrow">${heroEyebrow}</span><h1>湖北产业知识库</h1></div>`:`<span class="hero-eyebrow">${heroEyebrow}</span><h1>湖北产业知识库</h1><p class="hero-slogan">发现湖北产业脉络，连接城市与企业</p>`;
  const guideModes=[['industries','行业','Industry'],['cities','城市','City'],['policies','政策','Policy'],['companies','企业','Company']];
  const sidebarTabs=guideModes.map(([mode,label,labelEn])=>`<button type="button" class="explorer-tab ${homeGuideMode===mode?'active':''}" role="tab" aria-selected="${homeGuideMode===mode}" data-home-guide="${mode}"><span class="tab-copy"><b>${language==='en'?labelEn:label}</b></span></button>`).join('');
  return `<section class="home-hero ${homeChatExpanded?'is-chat-expanded':''}"><div class="hero-copy">${heroTitle}${chatSection}</div><div class="hero-visual" aria-hidden="true"><div class="hero-orbit orbit-one"></div><div class="hero-orbit orbit-two"></div><div class="hero-core">${heroCore}</div><span class="hero-node node-industry">行业</span><span class="hero-node node-city">城市</span><span class="hero-node node-enterprise">企业</span><svg viewBox="0 0 440 300" preserveAspectRatio="xMidYMid meet"><path d="M218 151 103 87M218 151 331 75M218 151 347 222M218 151 91 231M103 87 331 75M91 231 347 222"></path><circle cx="218" cy="151" r="4"></circle><circle cx="103" cy="87" r="3"></circle><circle cx="331" cy="75" r="3"></circle><circle cx="347" cy="222" r="3"></circle><circle cx="91" cy="231" r="3"></circle></svg></div></section><section class="home-explorer" id="homeDirectory"><div class="explorer-intro"><div><span class="guide-eyebrow">${language==='en'?'EXPLORE THE ATLAS':'湖北产业导览'}</span><h2>探索湖北产业</h2></div></div><div class="explorer-shell"><div class="explorer-sidebar" role="tablist" aria-label="选择探索维度">${sidebarTabs}</div><div class="explorer-content" id="homeGuidePanel" role="tabpanel">${homeGuidePanel()}</div></div></section>`;
}

function renderAssistant(){
  return `<section class="chat-panel"><div class="chat-header"><span class="chat-assistant-icon">✦</span><span class="chat-title"><b>智能AI</b><small>站内知识库 · 来源可追溯</small></span></div><div class="chat-messages" id="chatMessages" role="log" aria-live="polite">${chatHistory.map(renderChatExchange).join('')}</div><form class="chat-composer" id="askForm"><label class="visually-hidden" for="questionInput">输入产业问题</label><input id="questionInput" name="question" placeholder="输入你想了解的产业问题…" autocomplete="off"><button type="submit" aria-label="发送问题"><span>提问</span><b>↑</b></button></form><div class="chat-suggestions" id="chatSuggestions"><span>你可以试着问</span><button type="button" data-question="湖北人工智能产业链上游有哪些方向？">人工智能上游</button><button type="button" data-question="武汉有哪些人工智能产业布局？">武汉产业布局</button><button type="button" data-question="黑芝麻智能是什么企业？">企业档案</button></div></section>`;
}

function renderAbout(){
  const englishPage=language==='en';
  const copy=englishPage?{
    title:'About the Hubei Industry Knowledge Base',
    nav:['Platform','TF International','Hubei Industry Handbook'],
    platformTitle:'Hubei Industry Knowledge Base',
    platform:[
      'The Hubei Industry Knowledge Base is a digital industry information platform developed by TF International. Rooted in Hubei and oriented towards global markets, it brings together information on industries, cities, companies and policies to provide a structured overview of the foundations, regional distribution and cooperation opportunities of Hubei’s key industries. It offers domestic and international investors and industry partners a clear, accessible window into Hubei’s industrial landscape.',
      'The platform emphasizes both the structured presentation of information and the underlying connections between industries. Its Directory presents industry information through concise, intuitive cards, while the innovative Constellation Explorer and Map Explorer offer interactive ways to explore industrial connections and geographic distribution. These features help users look beyond individual sectors to understand opportunities for industrial collaboration, explore companies and policies in their regional context, and develop a more comprehensive understanding of Hubei’s industrial landscape.',
      'From the research behind the Hubei Industry Handbook series to the digital presentation of the Knowledge Base, TF International seeks to translate its growing industry insights into a shared language that is easy to access, understand and discuss—enabling professional research to better support investment decisions, business connections and project collaboration.',
      'Deepening our roots in Hubei, connecting with the world. The platform will continue to broaden its industry coverage and enrich its content. Drawing on Hong Kong’s strengths in connecting domestic and international markets, it aims to help international investors and industry partners understand the value of Hubei’s industries, while providing a reference for Hubei enterprises seeking overseas markets and cooperation opportunities. By fostering closer connections between technology, capital and markets, it seeks to turn sustained research on Hubei into development opportunities that stakeholders can pursue together.'
    ],
    companyTitle:'TF International Securities Group Limited',
    company:[
      'TF International Securities Group Limited (TF International) is a Hong Kong-based subsidiary fully owned by TF Securities (TFS). Hubei Hongtai Group Co., Ltd, the Controlling Shareholder of TFS, is the only financial services enterprise affiliated with Hubei Province. TF International serves as one of the key state-owned interfaces that connects the capital market overseas with Hubei Province and the rest of Mainland China, bridging the gap between domestic and foreign markets. Acting as a pilot platform for TFS\' global expansion aspirations, TFI provides top-notch financial services to clients and actively encourages inbound and outbound strategies for institutions and enterprises.',
      'TF International\'s subsidiaries are regulated by the Securities and Futures Commission of Hong Kong to conduct Type 1 (Dealing in Securities), Type 2 (Dealing in Futures Contracts), Type 4 (Advising on Securities), Type 5 (Advising on Futures Contracts), Type 6 (Advising on Corporate Finance) and Type 9 (Asset Management) regulated activities, establishing itself among the most active Chinese-funded securities firms in the Hong Kong market.'
    ],
    handbookTitle:'The Hubei Industry Handbook',
    handbookIntro:[
      'The Hubei Industry Handbook series is a panoramic industrial research publication by TF International Securities Group Limited, designed to systematically map the full-scale development of Hubei’s modern industrial system. Rooted in Hubei and oriented toward global markets, the series is compiled by the TF International team through extensive field research, broad-based data and information integration, and collaboration with multiple stakeholders. Drawing on comprehensive data, professional analysis and a forward-looking perspective, it seeks to present a holistic picture of the development foundations, competitive advantages and future opportunities of Hubei’s key industries.',
      'As an important platform of Hubei Hongtai Group Co., Ltd. and Tianfeng Securities Co., Ltd. for advancing their internationalization strategy and expanding international business, TF International is committed to leveraging its strengths in cross-border resource integration and connectivity with international markets. Through the Hubei Industry Handbook series, TF International seeks to support Hubei’s industrial upgrading and help enterprises expand their market reach, while systematically presenting Hubei’s industrial planning, innovation achievements, business environment and investment value to global markets. The series further aims to deepen Hubei’s connections with international capital, global industrial chains and overseas markets.'
    ],
    books:[
      {volume:'VOLUME 01',title:'Hubei Industry Handbook: New Materials',image:'assets/about/handbook-new-materials-en.jpeg',alt:'English cover of Hubei Industry Handbook: New Materials',description:'Hubei Industry Handbook: New Materials is the first volume. This volume focuses on the key development directions in the field of new materials in Hubei Province, systematically organizes and comprehensively covers the two core areas of semiconductor materials and new-energy lithium battery materials, and provides in-depth analysis of Hubei’s strategic breakthroughs and growth drivers within the new materials system. It highlights Hubei’s strategic positioning and industrial potential in frontier new-materials sectors.'},
      {volume:'VOLUME 02',title:'Hubei Industry Handbook: Laser & Optical Communication',image:'assets/about/handbook-laser-optical-en.png',alt:'English cover of Hubei Industry Handbook: Laser & Optical Communication',description:'Hubei Industry Handbook: Laser & Optical Communication, the second volume of the series, zeroes in on key development trajectories of Hubei’s laser and optical communication industries epitomized by Optics Valley. It systematically sorts out and fully addresses the two core segments: laser manufacturing and communications-enabled computing power. It further reviews the industrial foundations, technological directions, key market participants and application scenarios, delivering in-depth insights into the strategic breakthrough directions and sustained growth drivers of Hubei’s optical industrial cluster.'}
    ],
    handbookClosing:'Drawing on authoritative data, enterprise landscape and technological pathways, the Hubei Industry Handbook series aims to deliver high-caliber professional references for industry practitioners, policy-makers and investment institutions. The series will continue to review the development status, spatial distribution, leading enterprises, policy environment and market opportunities of Hubei’s key industries; map out Hubei’s pathways for connecting with global capital, integrating into international industrial chains and expanding into overseas markets; and help domestic and overseas investors better capture Hubei’s industrial opportunities, thereby supporting the high-quality opening-up and transformation and upgrading of Hubei’s industries.'
  }:{
    title:'关于湖北产业知识库',
    nav:['知识库简介','天风国际','湖北产业手册'],
    platformTitle:'湖北产业知识库简介',
    platform:[
      '湖北产业知识库是天风国际证券集团有限公司打造的数字化产业信息平台，立足湖北、面向全球，汇集行业、城市、企业与政策等多维信息，系统梳理湖北重点产业的发展基础、区域布局与合作机遇，为海内外投资者及产业伙伴认识湖北、研究湖北提供清晰、便捷的窗口。',
      '平台注重信息的有序呈现，也关注产业之间的内在联系。平台设置“目录”，以简明直观的卡片形式展示产业信息，并创新引入“星图探索”与“地图探索”模式，通过丰富的交互方式呈现产业关联与空间分布，帮助用户从单一行业拓展对产业协同的认识，结合城市布局了解企业与政策，逐步形成对湖北产业格局的整体理解。',
      '从《湖北产业手册》的系列研究，到知识库的数字化呈现，天风国际希望将持续积累的产业认识，转化为便于查询、理解与交流的共同语言，让专业研究更好地服务投资判断、企业对接与项目合作。',
      '深耕荆楚，联通世界。平台将持续拓展产业覆盖、深化内容建设，依托香港连接境内外市场的优势，帮助国际资本与产业伙伴理解湖北的产业价值，也为湖北企业寻找海外市场与合作空间提供参考，促进技术、资本与市场的交流融合，让对湖北的持续研究转化为各方共同参与的发展机遇。'
    ],
    companyTitle:'天风国际证券集团有限公司',
    company:[
      '天风国际证券集团有限公司（以下简称“天风国际”）是天风证券股份有限公司（以下简称“天风证券”）的全资香港子公司，天风证券控股股东湖北宏泰集团有限公司是湖北省属唯一金融服务类企业。作为天风证券国际化布局的重要支点，以及湖北省重要的对外金融窗口，天风国际依托集团与省内强大的资源支持，立足香港、背靠内地、深耕湖北、服务国家、布局全球，旨在发展成为连接境内外资本市场的桥梁，竭尽所能为客户提供全面优质的金融服务，积极推动优质企业“走出去”和“引进来”战略，为企业提供融资方案，为客户提供全球资产配置服务，打造境内外金融业务通道。',
      '天风国际通过旗下子公司从事香港证监会监管下的第1、2、4、5、6、9类受规管活动，跻身香港活跃中资券商之列。'
    ],
    handbookTitle:'《湖北产业手册》介绍',
    handbookIntro:[
      '《湖北产业手册》系列丛书由天风国际证券集团有限公司推出，是一套系统呈现湖北现代产业体系发展格局的全景式产业研究成果。丛书立足湖北、面向全球，由天风国际团队通过深入实地调研、广泛资料整合及多方协同编撰而成，力求以翔实的数据、专业的分析和前瞻的视角，全面展现湖北重点产业的发展基础、竞争优势与未来机遇。天风国际作为湖北宏泰集团和天风证券推进国际化战略、拓展国际业务的重要平台，致力于发挥跨境资源整合与国际市场连接优势，助力湖北产业升级和企业拓展发展空间。通过《湖北产业手册》系列丛书，天风国际希望向全球市场系统展示湖北的产业规划、创新成果、营商环境与投资价值，进一步促进湖北与国际资本、全球产业链及海外市场的深度链接。'
    ],
    books:[
      {volume:'第一册',title:'湖北产业手册：新材料分册',image:'assets/about/handbook-new-materials-zh.png',alt:'《湖北产业手册：新材料分册》中文版封面',description:'丛书首册《湖北产业手册：新材料分册》聚焦湖北省新材料领域的重点发展方向，围绕半导体材料与新能源锂电材料两大核心板块展开系统梳理与全面覆盖，展现湖北在前沿新材料领域的战略布局与产业潜力。'},
      {volume:'第二册',title:'湖北产业手册：激光与光通信分册',image:'assets/about/handbook-laser-optical-zh.png',alt:'《湖北产业手册：激光与光通信分册》中文版封面',description:'丛书第二册《湖北产业手册：激光与光通信分册》聚焦以“武汉光谷”为核心的湖北激光与光通信产业集群，围绕激光制造和通信算力两大核心板块，系统梳理产业基础、技术方向、重点主体及应用场景，深入呈现湖北光产业集群的战略突破方向与持续增长动能。'}
    ],
    handbookClosing:'《湖北产业手册》系列丛书将持续梳理湖北重点产业的发展现状、空间布局、龙头企业、政策环境与市场机遇，绘制湖北链接全球资本、融入国际产业链和拓展海外市场的产业图谱，助力海内外投资者更精准地把握湖北产业机遇，赋能湖北产业高质量对外开放与转型升级。'
  };
  const escapeText=value=>value.replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const paragraphs=items=>items.map(item=>`<p>${escapeText(item)}</p>`).join('');
  const bookCards=copy.books.map(book=>`<article class="about-book-card"><div class="about-book-cover"><img src="${book.image}" alt="${escapeText(book.alt)}" loading="lazy"></div><div class="about-book-copy"><h3>${escapeText(book.title)}</h3><p>${escapeText(book.description)}</p></div></article>`).join('');
  const sectionIds=['about-platform','about-tf-international','about-handbook'];
  const sectionNav=copy.nav.map((label,index)=>`<button type="button" data-about-target="${sectionIds[index]}">${escapeText(label)}</button>`).join('');
  return `<article class="about-page">
    <header class="about-hero">
      <div class="about-hero-inner">
        <div class="about-hero-copy"><h1>${escapeText(copy.title)}</h1></div>
        <div class="about-hero-art" aria-hidden="true"><div class="about-art-orbit orbit-a"></div><div class="about-art-orbit orbit-b"></div><div class="about-art-orbit orbit-c"></div><div class="about-art-core"></div><i class="about-art-node node-a"></i><i class="about-art-node node-b"></i><i class="about-art-node node-c"></i><i class="about-art-node node-d"></i></div>
      </div>
    </header>
    <nav class="about-index" aria-label="${englishPage?'About sections':'关于页面目录'}">${sectionNav}</nav>
    <div class="about-content">
      <section class="about-section about-platform" id="about-platform">
        <h2>${escapeText(copy.platformTitle)}</h2>
        <div class="about-platform-copy">${paragraphs(copy.platform)}</div>
      </section>
      <section class="about-section about-company" id="about-tf-international">
        <div class="about-company-brand"><img src="${englishPage?'tianfeng-logo-en-light.svg':'tianfeng-logo-light.svg'}" alt="${englishPage?'TF International Securities':'天风国际证券'}" loading="lazy"></div>
        <div class="about-company-copy"><h2>${escapeText(copy.companyTitle)}</h2>${paragraphs(copy.company)}</div>
      </section>
      <section class="about-section about-handbook" id="about-handbook">
        <h2>${escapeText(copy.handbookTitle)}</h2>
        <div class="about-handbook-intro">${paragraphs([...copy.handbookIntro,copy.handbookClosing])}</div>
        <div class="about-books-grid">${bookCards}</div>
      </section>
    </div>
  </article>`;
}

function renderChatExchange(exchange){
  if(exchange.demo)return renderChatDemoExchange(exchange);
  const question=exchange.question.replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const result=exchange[language];
  return `<div class="chat-row user-row"><div class="chat-stack"><div class="chat-bubble" data-preserve-text>${question}</div></div><span class="chat-avatar user-avatar">${language==='en'?'ME':'我'}</span></div><div class="chat-row assistant-row"><span class="chat-avatar">✦</span><div class="chat-stack"><div class="chat-bubble assistant-bubble"><p>${result.body}</p><div class="chat-sources">${result.sources.map(source=>`<a href="#${source[1]}">${language==='en'?'Source: ':'来源：'}${source[0]}</a>`).join('')}</div><small class="reply-note">${language==='en'?'Demo reply · Based on migrated site content':'演示回复 · 基于本站迁入资料'}</small></div></div></div>`;
}

function renderIndustries(){
  const pageTitle=language==='en'?'Primary industry directory':'一级行业目录';
  const description=language==='en'?'Browse primary industries. Open a profile to explore its secondary industries.':'按一级行业浏览湖北产业分类，进入专题后可继续查看旗下二级行业。';
  const primaryIndustries=industryStarGroups.map(group=>industryById(group.industryId));
  return `${previousBackLink(language==='en'?'Back':'返回上级')} ${header('',pageTitle,description)}
  <section class="section-block"><div class="industry-grid">${primaryIndustries.map(industryCard).join('')}</div></section>`;
}

function renderPrimaryIndustryDetail(industry){
  const secondaryCards=industry.children.map(secondaryIndustryCard).join('');
  return `${backLink('industries',language==='en'?'Back to primary industries':'返回一级行业目录')}<div class="detail-heading"><div class="view-kicker">${language==='en'?'PRIMARY INDUSTRY PROFILE':'一级行业专题'}</div><h1>${industry.name}</h1><p>${industry.intro}</p><div class="tag-list"><span class="tag">${language==='en'?'Primary industry':'一级行业'}</span><span class="tag">${industry.children.length} ${language==='en'?'secondary industries':'个二级行业'}</span></div></div>
  <section class="section-block panel panel-pad"><div class="section-heading"><div><h2>${language==='en'?'Secondary industries':'旗下二级行业'}</h2><p>${language==='en'?'Choose a secondary industry to open its dedicated profile.':'点击二级行业，进入对应的独立专题页。'}</p></div></div><div class="industry-grid">${secondaryCards}</div>${industry.source?`<div class="source-note">${language==='en'?'Source category: ':'分类来源：'}${industry.source}</div>`:''}</section>`;
}

function renderSecondaryIndustryDetail(industry){
  return renderSourceIndustry(industry);
}

function renderIndustryDetail(id){
  const industry=industryById(id);
  if(!industry)return `${backLink('industries',language==='en'?'Back to primary industries':'返回一级行业目录')}<div class="empty-state">${language==='en'?'Industry not found.':'暂未找到该行业。'}</div>`;
  return industry.starLevel==='primary'?renderPrimaryIndustryDetail(industry):renderSecondaryIndustryDetail(industry);
}

function renderCities(){const pageTitle=language==='en'?'City directory':'城市目录';const description=language==='en'?'Explore Hubei cities, their industry priorities and related companies. Open a profile to see local plans.':'按城市浏览湖北产业布局、重点行业与相关企业，进入专题查看城市介绍。';return `${previousBackLink(language==='en'?'Back':'返回上级')} ${header('',pageTitle,description)}<section class="section-block"><div class="city-grid">${cities.map(cityCard).join('')}</div></section>`}

function renderPolicies(query='',level='all'){
  const normalizedQuery=query.trim().toLowerCase();
  const filtered=policies.filter(policy=>(level==='all'||policy.level===level)&&`${policy.name} ${policy.nameEn||''} ${policy.category} ${policy.issuer} ${policy.date}`.toLowerCase().includes(normalizedQuery));
  const title=language==='en'?'Policy directory':'政策目录';
  const description=language==='en'?'Browse policy examples listed in the optical communications supplement. Titles and metadata are shown for demonstration and need verification.':'浏览光通信分册附录中列示的政策样例。当前仅展示标题与元数据，正式使用前需核验。';
  const note=language==='en'?'Source: the supplied optical communications policy supplement. Full text and current validity have not been independently reviewed.':'来源：用户提供的光通信分册政策附录。当前为资料样例，未独立核验政策原文及现行有效性。';
  const levels=[['all',language==='en'?'All levels':'全部级别'],['国家级',language==='en'?'National':'国家级'],['省级',language==='en'?'Provincial':'省级'],['市级',language==='en'?'Municipal':'市级']];
  return `${previousBackLink(language==='en'?'Back':'返回上级')} ${header(language==='en'?'POLICY DIRECTORY':'政策目录',title,description,`${filtered.length} / ${policies.length} ${language==='en'?'records':'条'}`)}<div class="filter-row"><label class="visually-hidden" for="policySearch">${language==='en'?'Search policies':'搜索政策'}</label><input id="policySearch" type="search" placeholder="${language==='en'?'Search title, category or issuer':'搜索政策名称、类别或发布单位'}" value="${query.replaceAll('"','&quot;')}"><label class="visually-hidden" for="policyLevel">${language==='en'?'Filter by level':'按级别筛选'}</label><select id="policyLevel">${levels.map(([value,label])=>`<option value="${value}" ${level===value?'selected':''}>${label}</option>`).join('')}</select><span class="result-count">${filtered.length} ${language==='en'?'matches':'条结果'}</span></div><section class="section-block"><div class="industry-grid policy-grid">${filtered.map(policyCard).join('')||`<div class="empty-state">${language==='en'?'No matching policies.':'没有符合条件的政策。'}</div>`}</div></section><div class="source-note">${note}</div>`;
}

function renderPolicyDetail(id){
  const policy=policies.find(item=>item.id===id);
  if(!policy)return renderPolicies();
  const name=language==='en'?policy.nameEn:policy.name;
  const level=language==='en'?policy.levelEn:policy.level;
  const category=language==='en'?policy.categoryEn:policy.category;
  const issuer=language==='en'?policy.issuerEn:policy.issuer;
  const sourceNote=language==='en'?'Source: the supplied optical communications policy supplement. Only the listed title and metadata are migrated; verify the full text and current validity before relying on this entry.':'来源：用户提供的光通信分册政策附录。本演示仅迁入附录列示的标题和元数据；政策原文及现行有效性需进一步核验。';
  return `${backLink('policies',language==='en'?'Back to policies':'返回政策目录')}<div class="detail-heading"><div class="view-kicker">${language==='en'?'POLICY SAMPLE · OPTICAL COMMUNICATIONS':'政策样例 · 光通信分册'}</div><h1>${name}</h1><p>${language==='en'?policy.introEn:policy.intro}</p><div class="tag-list"><span class="tag">${level}</span><span class="tag">${category}</span></div></div><div class="detail-grid"><section class="panel detail-card"><h2>${language==='en'?'Policy information':'政策信息'}</h2><div class="profile-stat"><b>${language==='en'?'Issuing body':'发布单位'}</b>${issuer}</div><div class="profile-stat"><b>${language==='en'?'Listed date':'附录时间'}</b>${policy.date}</div><div class="empty-state">${language==='en'?'Only the title and appendix metadata are included in this demo. The policy text and a reviewed summary have not been migrated.':'当前演示仅包含标题与附录元数据，尚未迁入政策原文及经审核的摘要。'}</div></section><aside class="panel detail-card"><h2>${language==='en'?'Source and status':'来源与状态'}</h2><div class="profile-stat"><b>${language==='en'?'Source':'来源'}</b>${language==='en'?'Optical communications supplement':'光通信分册政策附录'}</div><div class="profile-stat"><b>${language==='en'?'Review status':'核验状态'}</b>${language==='en'?'Pending verification':'待核验'}</div><p class="source-note">${sourceNote}</p></aside></div>`;
}

function renderExploreMap(){
  const labels=language==='en'?{map:'China industry map',aria:'Map of China with interactive Hubei prefecture-level regions',controls:'Map controls',zoomOut:'Zoom out',zoomIn:'Zoom in',reset:'Reset map view'}:{map:'中国产业地图',aria:'中国地图，湖北省内17个市州可交互',controls:'地图缩放控制',zoomOut:'缩小地图',zoomIn:'放大地图',reset:'重置地图视图'};
  const stylePicker=`<div class="map-style-picker" data-preserve-text><label for="mapStyleSelect">${language==='en'?'Appearance':'视觉样式'}</label><select id="mapStyleSelect" aria-label="${language==='en'?'Map appearance':'地图样式'}"><option value="1"${mapStyle==='1'?' selected':''}>${language==='en'?'Style 1 · Classic':'样式一 · 经典地图'}</option><option value="2"${mapStyle==='2'?' selected':''}>${language==='en'?'Style 2 · Globe':'样式二 · 球面图谱'}</option></select></div>`;
  const controls=`<div class="map-controls" role="group" aria-label="${labels.controls}"><button type="button" data-map-control="out" aria-label="${labels.zoomOut}" title="${labels.zoomOut}">−</button><output class="map-zoom-level" aria-live="polite">${Math.round((mapStyle==='2'?globeMapView.zoom:mapScale)*100)}%</output><button type="button" data-map-control="in" aria-label="${labels.zoomIn}" title="${labels.zoomIn}">+</button><span class="map-control-divider" aria-hidden="true"></span><button type="button" data-map-control="reset" aria-label="${labels.reset}" title="${labels.reset}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 8a6.5 6.5 0 1 1 .7 4.8M3.5 8V3.8M3.5 8h4.2"></path></svg></button></div>`;
  if(mapStyle==='2')return `<section class="hubei-map-layout globe-map-layout" aria-label="${labels.map}"><div class="hubei-map-panel globe-map-panel" data-preserve-text>${stylePicker}<canvas class="globe-canvas" role="img" aria-label="${labels.aria}"></canvas><svg class="globe-leaders" aria-hidden="true"></svg><div class="globe-labels"></div><div class="globe-province-label">${language==='en'?'HUBEI':'湖北省'}</div>${controls}<div class="globe-status" role="status">${language==='en'?'Preparing the globe…':'正在展开球面地图…'}</div></div></section>`;
  const mapViewport=window.chinaMapViewport||{focus:{x:442,y:243},hubeiTransform:{tx:0,ty:0,sx:1,sy:1}};
  const hubeiTransform=mapViewport.hubeiTransform;
  const chinaShapes=(window.chinaMapFeatures||[]).map(feature=>'<path class="china-province'+(feature.code==='420000'?' is-hubei':'')+'" d="'+feature.d+'" fill-rule="evenodd"><title>'+feature.name+'</title></path>').join('');
  const mapShapes=hubeiMapUnits.map(unit=>'<a class="map-city-shape" href="#city/'+unit.id+'" aria-label="'+(language==='en'?'Explore':'进入')+' '+mapCityName(unit)+'"><path d="'+unit.d+'" fill-rule="evenodd"><title>'+mapCityName(unit)+'</title></path></a>').join('');
  const labelCounterScale=`scale(${(1/(hubeiTransform.sx*mapScale)).toFixed(6)} ${(1/(hubeiTransform.sy*mapScale)).toFixed(6)})`;
  const mapLabels=hubeiMapUnits.map(unit=>'<g class="map-city-label" data-city-id="'+unit.id+'" transform="translate('+unit.label[0]+' '+unit.label[1]+')"><g class="map-city-label-visual" transform="'+labelCounterScale+'"><path class="map-city-label-leader"></path><circle r="2.2"></circle><text>'+mapCityName(unit)+'</text></g></g>').join('');
  const hubeiOutline=(window.chinaMapFeatures||[]).find(feature=>feature.code==='420000')?.d||'';
  return [
    '<section class="hubei-map-layout" aria-label="'+labels.map+'">',
    '<div class="hubei-map-panel">',stylePicker,
    '<svg class="hubei-map-svg" viewBox="0 0 720 520" role="img" aria-label="'+labels.aria+'">',
    '<g class="map-transform"><g class="china-provinces" aria-hidden="true">',chinaShapes,'</g><path class="china-maritime-line" d="'+(window.chinaMapMaritimePath||'')+'" aria-hidden="true"></path><g class="hubei-units-transform" transform="translate('+hubeiTransform.tx+' '+hubeiTransform.ty+') scale('+hubeiTransform.sx+' '+hubeiTransform.sy+')"><g class="map-city-shapes">',mapShapes,'</g><g class="map-city-labels" aria-hidden="true">',mapLabels,'</g></g><path class="hubei-outline" d="'+hubeiOutline+'" fill-rule="evenodd" aria-hidden="true"></path></g></svg>',
    '<div class="map-controls" role="group" aria-label="'+labels.controls+'">',
    '<button type="button" data-map-control="out" aria-label="'+labels.zoomOut+'" title="'+labels.zoomOut+'">−</button>',
    '<output class="map-zoom-level" aria-live="polite">'+Math.round(mapInitialScale*100)+'%</output>',
    '<button type="button" data-map-control="in" aria-label="'+labels.zoomIn+'" title="'+labels.zoomIn+'">+</button>',
    '<span class="map-control-divider" aria-hidden="true"></span>',
    '<button type="button" data-map-control="reset" aria-label="'+labels.reset+'" title="'+labels.reset+'"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 8a6.5 6.5 0 1 1 .7 4.8M3.5 8V3.8M3.5 8h4.2"></path></svg></button>',
    '</div></div></section>'
  ].join('');
}

function starIndustryName(group){return language==='en'?group.nameEn:group.name}
function starSatelliteName(satellite){return satellite[language==='en'?2:1]}

function renderStarDetail(){
  const group=industryStarGroups.find(item=>item.industryId===starView.selectedId)||industryStarGroups[0];
  const selectedSatellite=group.satellites.find(item=>item[0]===starView.selectedSatellite);
  if(selectedSatellite){
    const profile=industryById(selectedSatellite[0]);
    return `<div class="star-popup-card star-secondary-card" role="dialog" aria-label="${language==='en'?'Secondary industry details':'二级行业详情'}"><div class="star-detail-top"><h2>${starSatelliteName(selectedSatellite)}</h2><button type="button" class="star-popup-close" data-star-close aria-label="${language==='en'?'Close details':'关闭详情'}">×</button></div><p>${profile.intro}</p><div class="star-source-line">${language==='en'?'Primary industry':'所属一级行业'}<b>${starIndustryName(group)}</b></div><a class="star-profile-link" href="#industry/${selectedSatellite[0]}">${language==='en'?'Open secondary industry profile':'查看二级行业专题'}<span aria-hidden="true">↗</span></a></div>`;
  }
  const list=group.satellites.length
    ? `<div class="star-satellite-list">${group.satellites.map(satellite=>`<button type="button" class="star-satellite-chip" data-star-satellite="${satellite[0]}"><span class="star-satellite-dot"></span>${starSatelliteName(satellite)}<span class="star-chip-arrow">↗</span></button>`).join('')}</div>`
    : `<div class="star-empty-note">${language==='en'?'No secondary entries mapped to this primary industry yet.':'该一级行业暂无可对应的原站二级条目。'}</div>`;
  return `<div class="star-popup-card" role="dialog" aria-label="${language==='en'?'Primary industry details':'一级行业详情'}"><div class="star-detail-top"><h2>${starIndustryName(group)}</h2><button type="button" class="star-popup-close" data-star-close aria-label="${language==='en'?'Close details':'关闭详情'}">×</button></div><h3>${language==='en'?'Included secondary industries':'包含二级行业'} <small>${group.satellites.length}</small></h3>${list}<a class="star-profile-link" href="#industry/${group.industryId}">${language==='en'?'Open industry profile':'进入行业专题'}<span aria-hidden="true">↗</span></a></div>`;
}

function renderExploreStars(){
  const legacyCaptions=starStyle==='1'?`<div class="star-drag-hint"><span class="star-drag-icon">✥</span>${language==='en'?'Drag to rotate · Scroll or pinch to zoom':'拖动旋转 · 滚轮或双指缩放'}</div><div class="star-legend"><span><i class="legend-sun"></i>${language==='en'?'Primary industry':'一级行业'}</span><span><i class="legend-moon"></i>${language==='en'?'Secondary industry':'二级行业'}</span></div>`:'';
  const stylePicker=`<div class="star-style-picker" data-preserve-text><label for="starStyleSelect">${language==='en'?'Appearance':'视觉样式'}</label><select id="starStyleSelect" aria-label="${language==='en'?'Star map appearance':'星图样式'}"><option value="1"${starStyle==='1'?' selected':''}>${language==='en'?'Style 1 · Classic':'样式一 · 经典星图'}</option><option value="2"${starStyle==='2'?' selected':''}>${language==='en'?'Style 2 · Aurora':'样式二 · 星环宇宙'}</option></select></div>`;
  return `<section class="star-page"><div class="star-explorer"><div class="star-stage panel" data-star-style="${starStyle}">${stylePicker}<canvas id="industryStarCanvas" aria-label="${language==='en'?'Interactive 3D industry star map':'可交互的湖北产业3D星图'}"></canvas><div id="starInfoPopup" class="star-info-popup" hidden></div><div class="star-controls" role="group" aria-label="${language==='en'?'Star map controls':'星图控制'}"><button type="button" data-star-control="zoom-out" aria-label="${language==='en'?'Zoom out':'缩小'}" title="${language==='en'?'Zoom out':'缩小'}">−</button><output id="starZoomLevel" aria-live="polite">100%</output><button type="button" data-star-control="zoom-in" aria-label="${language==='en'?'Zoom in':'放大'}" title="${language==='en'?'Zoom in':'放大'}">+</button><span class="star-control-divider"></span><button type="button" data-star-control="reset" aria-label="${language==='en'?'Restore view':'恢复默认视图'}" title="${language==='en'?'Restore view':'恢复默认视图'}"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8a6.5 6.5 0 1 1 .7 4.8M3.5 8V3.8M3.5 8h4.2"></path></svg></button></div>${legacyCaptions}</div></div></section>`;
}

function updateStarDetail(){
  const popup=document.querySelector('#starInfoPopup');
  if(!popup)return;
  popup.hidden=!starPopupOpen;
  if(!starPopupOpen){popup.innerHTML='';return}
  popup.innerHTML=renderStarDetail();
  starMapRefresh();
}

function initializeStarMap(){
  starMapCleanup();
  const canvas=document.querySelector('#industryStarCanvas');
  if(!canvas)return;
  const context=canvas.getContext('2d');
  if(!context)return;
  const controller=new AbortController();
  const alternateRenderer=starStyle==='2'?createAuroraStarRenderer(context,industryStarGroups):null;
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let width=0;
  let height=0;
  let dpr=1;
  let resizeObserver;
  const pointers=new Map();
  let gesture=null;
  let didDrag=false;
  const maxZoom=2.3;
  const minZoom=.55;
  let animationFrame=0;
  let animationTime=0;
  let lastFrameTime=0;
  const resize=()=>{
    const rect=canvas.getBoundingClientRect();
    width=Math.max(1,rect.width);
    height=Math.max(1,rect.height);
    dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(width*dpr);
    canvas.height=Math.round(height*dpr);
    context.setTransform(dpr,0,0,dpr,0,0);
    draw();
  };
  const focalLength=()=>alternateRenderer?Math.max(1200,Math.max(width,height)*1.75):1000;
  const rotatePoint=(point)=>{
    const cy=Math.cos(starView.yaw),sy=Math.sin(starView.yaw);
    const cp=Math.cos(starView.pitch),sp=Math.sin(starView.pitch);
    const rotatedX=point.x*cy-point.z*sy;
    const rotatedZ=point.x*sy+point.z*cy;
    const rotatedY=point.y*cp-rotatedZ*sp;
    const depth=point.y*sp+rotatedZ*cp;
    const focal=focalLength();
    const perspective=focal/(focal+depth);
    const zoom=starView.zoom;
    return {x:width/2+rotatedX*zoom*perspective,y:height/2+rotatedY*zoom*perspective,depth,scale:perspective};
  };
  const shellRadii=()=>{
    if(width<=720){
      const radius=Math.min(width*.16,height*.29);
      return {x:radius,y:radius,z:radius};
    }
    const radius=Math.min(width*.37,height*.32);
    return {x:radius,y:radius,z:radius};
  };
  const satelliteOrbitRadius=()=>Math.min(width*(width<=720?.09:.11),height*(width<=720?.075:.09),112);
  const cameraFacingPoint=(center,angle,radius)=>{
    const screenX=Math.cos(angle)*radius;
    const screenY=Math.sin(angle)*radius;
    const cy=Math.cos(starView.yaw),sy=Math.sin(starView.yaw);
    const cp=Math.cos(starView.pitch),sp=Math.sin(starView.pitch);
    return {
      x:center.x+screenX*cy-screenY*sp*sy,
      y:center.y+screenY*cp,
      z:center.z-screenX*sy-screenY*sp*cy
    };
  };
  const rootBase=(index)=>{
    const count=industryStarGroups.length;
    const radii=shellRadii();
    const seededNoise=(seed)=>{
      const value=Math.sin(seed*127.1+311.7)*43758.5453;
      return value-Math.floor(value);
    };
    const vertical=Math.max(-1,Math.min(1,1-2*(index+.5)/count+(seededNoise(index+1)-.5)*.08));
    const angle=index*Math.PI*(3-Math.sqrt(5))+(seededNoise(index+count+1)-.5)*.34;
    const radial=Math.sqrt(1-vertical*vertical);
    return {
      x:radial*Math.cos(angle)*radii.x,
      y:vertical*radii.y,
      z:radial*Math.sin(angle)*radii.z
    };
  };
  const satellitePoints=(group,index)=>group.satellites.map((satellite,satelliteIndex)=>{
    const angle=satelliteIndex*Math.PI*2/Math.max(1,group.satellites.length)-.6+index*.24;
    const root=rootBase(index);
    return {...cameraFacingPoint(root,angle,satelliteOrbitRadius()),type:'satellite',group,satellite,pointIndex:satelliteIndex};
  });
  const stars=Array.from({length:320},(unused,starIndex)=>({x:((starIndex*173+41)%997)/997,y:((starIndex*293+83)%991)/991,r:.35+(starIndex%4)*.22,a:.16+(starIndex%5)*.085,phase:starIndex*1.71}));
  const backgroundStarColors=['255,248,227','128,212,255','255,207,122','145,244,204','231,245,255','255,174,155'];
  const drawStarBackground=time=>{
    const drifting=starStyle==='2';
    const count=drifting?Math.round(1.6*Math.max(40,Math.min(stars.length/2,Math.round(width*height/8000)))):110;
    for(let index=0;index<count;index++){
      const star=stars[index];
      const depth=.45+(index%3)*.25;
      const driftX=drifting?Math.sin(time*.00036+star.phase)*22*depth:0;
      const driftY=drifting?Math.cos(time*.00027+star.phase)*12*depth:0;
      const positionX=drifting?20+star.x*Math.max(0,width-40)+driftX:star.x*width;
      const positionY=drifting?20+star.y*Math.max(0,height-40)+driftY:star.y*height;
      const twinkle=drifting?.5+.5*(Math.sin(time*.00065+star.phase)+1)/2:.62+.38*(Math.sin(time*.0011+star.phase)+1)/2;
      const opacity=drifting?(.72+.28*twinkle)*.2:star.a*twinkle;
      const radius=drifting?.95+star.r*1.25:star.r;
      const starColor=backgroundStarColors[index%backgroundStarColors.length];
      if(drifting){
        const halo=context.createRadialGradient(positionX,positionY,0,positionX,positionY,radius*4);
        halo.addColorStop(0,`rgba(${starColor},${opacity*.7})`);
        halo.addColorStop(.3,`rgba(${starColor},${opacity*.32})`);
        halo.addColorStop(1,`rgba(${starColor},0)`);
        context.fillStyle=halo;
        context.fillRect(positionX-radius*4,positionY-radius*4,radius*8,radius*8);
      }
      context.beginPath();context.arc(positionX,positionY,radius,0,Math.PI*2);
      context.fillStyle=drifting?`rgba(${starColor},${opacity})`:`rgba(224,235,216,${opacity})`;context.fill();
      if(drifting){
        context.beginPath();context.arc(positionX,positionY,radius*.46,0,Math.PI*2);
        context.fillStyle=`rgba(255,255,247,${opacity})`;context.fill();
      }
      if(drifting&&index%13===0){
        context.fillStyle=`rgba(${starColor},${opacity*.85})`;
        context.fillRect(positionX-4.2,positionY-.45,8.4,.9);
        context.fillRect(positionX-.45,positionY-4.2,.9,8.4);
      }
    }
  };
  const hexToRgb=(hex)=>{const value=parseInt(hex.slice(1),16);return {r:value>>16&255,g:value>>8&255,b:value&255}};
  const colors=['#dbe99b','#c4dbd1','#f0cc84','#a8c9e7','#d2b5e8'];
  const drawCoreOrbits=()=>{
    const radii=shellRadii();
    const planes=[
      angle=>({x:Math.cos(angle)*radii.x,y:Math.sin(angle)*radii.y,z:0}),
      angle=>({x:Math.cos(angle)*radii.x,y:0,z:Math.sin(angle)*radii.z}),
      angle=>({x:0,y:Math.cos(angle)*radii.y,z:Math.sin(angle)*radii.z})
    ];
    context.save();
    context.setLineDash([2,12]);
    context.lineDashOffset=-animationTime*.004;
    context.lineWidth=1;
    context.strokeStyle='rgba(130,205,221,.13)';
    for(const plane of planes){
      context.beginPath();
      for(let step=0;step<=96;step++){
        const point=rotatePoint(plane(step/96*Math.PI*2));
        if(step===0)context.moveTo(point.x,point.y);else context.lineTo(point.x,point.y);
      }
      context.closePath();
      context.stroke();
    }
    context.restore();
  };
  const drawOrbit=(center,index)=>{
    const base=rootBase(index);
    if(!center.group.satellites.length)return;
    context.beginPath();
    for(let step=0;step<=72;step++){
      const angle=step/72*Math.PI*2;
      const projected=rotatePoint(cameraFacingPoint(base,angle,satelliteOrbitRadius()));
      if(step===0)context.moveTo(projected.x,projected.y);else context.lineTo(projected.x,projected.y);
    }
    context.closePath();
    context.strokeStyle=starView.selectedId===center.group.industryId?'rgba(203,225,158,.26)':'rgba(193,213,201,.14)';
    context.lineWidth=1;
    context.stroke();
  };
  const drawConnections=()=>{
    const edges=[[0,1],[1,2],[0,3],[1,4],[2,5],[3,4],[4,5],[3,6],[4,7],[5,7],[6,7]];
    const pulse=.86+.14*Math.sin(animationTime*.0007);
    context.save();
    context.setLineDash([3,7]);
    context.lineDashOffset=-animationTime*.012;
    context.lineCap='round';
    edges.forEach(([firstIndex,secondIndex],edgeIndex)=>{
      const firstBase=rootBase(firstIndex);
      const secondBase=rootBase(secondIndex);
      const first=rotatePoint(firstBase);
      const second=rotatePoint(secondBase);
      const midpoint=rotatePoint({x:(firstBase.x+secondBase.x)*.5,y:(firstBase.y+secondBase.y)*.5,z:(firstBase.z+secondBase.z)*.5});
      const bend=((edgeIndex%3)-1)*8;
      context.beginPath();
      context.moveTo(first.x,first.y);
      context.quadraticCurveTo(midpoint.x+bend,midpoint.y-bend,second.x,second.y);
      context.strokeStyle=`rgba(75,190,226,${(.18+edgeIndex%3*.025)*pulse})`;
      context.lineWidth=4;
      context.stroke();
      context.strokeStyle=`rgba(186,239,245,${(.38+edgeIndex%3*.035)*pulse})`;
      context.lineWidth=1.35;
      context.stroke();
    });
    context.restore();
  };
  const nodes=[];
  const positionStarPopup=()=>{
    const popup=document.querySelector('#starInfoPopup');
    const anchorNode=nodes.find(node=>node.type===(starView.selectedSatellite?'satellite':'primary')&&node.group.industryId===starView.selectedId&&(!starView.selectedSatellite||node.satellite[0]===starView.selectedSatellite));
    if(!popup||popup.hidden||!starPopupOpen||!anchorNode)return;
    const popupWidth=popup.offsetWidth;
    const popupHeight=popup.offsetHeight;
    const gap=alternateRenderer?anchorNode.hitRadius+12:18;
    let left;
    let top;
    let anchorSide;
    if(width<=720){
      left=(width-popupWidth)/2;
      top=anchorNode.point.y+gap;
      anchorSide='top';
      if(top+popupHeight>height-12){top=anchorNode.point.y-popupHeight-gap;anchorSide='bottom'}
    }else{
      left=anchorNode.point.x+gap;
      if(left+popupWidth>width-12)left=anchorNode.point.x-popupWidth-gap;
      top=anchorNode.point.y-popupHeight/2;
      anchorSide=left>anchorNode.point.x?'right':'left';
    }
    left=Math.max(12,Math.min(width-popupWidth-12,left));
    top=Math.max(12,Math.min(height-popupHeight-12,top));
    popup.style.left=`${left}px`;
    popup.style.top=`${top}px`;
    popup.dataset.anchorSide=anchorSide;
  };
  const draw=()=>{
    if(!width||!height)return;
    if(alternateRenderer){
      nodes.length=0;
      nodes.push(...alternateRenderer.draw({width,height,time:reducedMotion.matches?0:animationTime,project:rotatePoint,view:starView,language,drawBackground:drawStarBackground,focalLength:focalLength()}));
      const zoom=document.querySelector('#starZoomLevel');
      if(zoom)zoom.textContent=`${Math.round(starView.zoom*100)}%`;
      positionStarPopup();
      return;
    }
    context.clearRect(0,0,width,height);
    drawStarBackground(animationTime);
    nodes.length=0;
    drawCoreOrbits();
    drawConnections();
    industryStarGroups.forEach((group,index)=>drawOrbit({group},index));
    industryStarGroups.forEach((group,index)=>{
      const point=rootBase(index);
      nodes.push({type:'primary',group,point:rotatePoint(point),color:colors[index%colors.length],radius:13});
      satellitePoints(group,index).forEach(satellite=>nodes.push({...satellite,point:rotatePoint(satellite),color:'#c8d9ce',radius:5.2}));
    });
    nodes.sort((firstNode,secondNode)=>secondNode.point.depth-firstNode.point.depth);
    const reservedLabels=nodes.filter(node=>node.type==='primary').map(node=>{
      const {x,y,scale}=node.point;
      const radius=node.radius*(starView.selectedId===node.group.industryId?1.18:1)*Math.max(.72,scale);
      context.font=`${node.group.industryId===starView.selectedId?'700':'600'} ${Math.max(10,Math.min(13,11*scale))}px Inter,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif`;
      const labelWidth=context.measureText(starIndustryName(node.group)).width;
      const labelTop=y+radius+5;
      return {left:x-labelWidth/2,right:x+labelWidth/2,top:labelTop,bottom:labelTop+16};
    });
    for(const node of nodes){
      const {x:screenX,y:screenY,depth,scale}=node.point;
      const visible=depth>0?.72:1;
      if(node.type==='primary'){
        const radius=node.radius*(starView.selectedId===node.group.industryId?1.18:1)*Math.max(.72,scale);
        const color=hexToRgb(node.color);
        const glow=context.createRadialGradient(screenX-radius*.2,screenY-radius*.25,1,screenX,screenY,radius*2.7);
        glow.addColorStop(0,`rgba(${color.r},${color.g},${color.b},.95)`);
        glow.addColorStop(.45,`rgba(${color.r},${color.g},${color.b},.28)`);
        glow.addColorStop(1,`rgba(${color.r},${color.g},${color.b},0)`);
        context.beginPath();context.arc(screenX,screenY,radius*2.7,0,Math.PI*2);context.fillStyle=glow;context.fill();
        context.beginPath();context.arc(screenX,screenY,radius,0,Math.PI*2);context.fillStyle=node.color;context.globalAlpha=visible;context.fill();context.globalAlpha=1;
        context.beginPath();context.arc(screenX-radius*.27,screenY-radius*.29,radius*.23,0,Math.PI*2);context.fillStyle='#ffffffcc';context.fill();
        if(starView.selectedId===node.group.industryId){context.beginPath();context.arc(screenX,screenY,radius+5,0,Math.PI*2);context.strokeStyle='#dceba788';context.lineWidth=1;context.stroke()}
        context.font=`${node.group.industryId===starView.selectedId?'700':'600'} ${Math.max(10,Math.min(13,11*scale))}px Inter,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif`;
        context.textAlign='center';context.textBaseline='top';context.fillStyle=`rgba(242,246,237,${visible})`;
        context.fillText(starIndustryName(node.group),screenX,screenY+radius+7);
      }else{
        const radius=node.radius*Math.max(.72,scale);
        const selected=starView.selectedSatellite===node.satellite[0]&&starView.selectedId===node.group.industryId;
        context.beginPath();context.arc(screenX,screenY,radius*(selected?2.05:1.6),0,Math.PI*2);context.fillStyle=selected?'#e3edbd55':'#cfe0d633';context.fill();
        context.beginPath();context.arc(screenX,screenY,radius*(selected?1.1:.78),0,Math.PI*2);context.fillStyle=selected?'#e7efc4':node.color;context.globalAlpha=visible;context.fill();context.globalAlpha=1;
        if(starView.selectedId===node.group.industryId){
          context.font=`${selected?'600':'500'} ${Math.max(9,Math.min(11,10*scale))}px Inter,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif`;
          const groupCenter=rotatePoint(rootBase(industryStarGroups.indexOf(node.group)));
          const offsetX=screenX-groupCenter.x;
          const offsetY=screenY-groupCenter.y;
          const label=starSatelliteName(node.satellite);
          const labelWidth=context.measureText(label).width;
          const labelHeight=13;
          const candidates=[
            {x:screenX+radius+7,y:screenY,align:'left',baseline:'middle',left:screenX+radius+5,right:screenX+radius+9+labelWidth,top:screenY-labelHeight/2,bottom:screenY+labelHeight/2,dx:1,dy:0},
            {x:screenX-radius-7,y:screenY,align:'right',baseline:'middle',left:screenX-radius-9-labelWidth,right:screenX-radius-5,top:screenY-labelHeight/2,bottom:screenY+labelHeight/2,dx:-1,dy:0},
            {x:screenX,y:screenY-radius-7,align:'center',baseline:'bottom',left:screenX-labelWidth/2,right:screenX+labelWidth/2,top:screenY-radius-7-labelHeight,bottom:screenY-radius-5,dx:0,dy:-1},
            {x:screenX,y:screenY+radius+7,align:'center',baseline:'top',left:screenX-labelWidth/2,right:screenX+labelWidth/2,top:screenY+radius+5,bottom:screenY+radius+7+labelHeight,dx:0,dy:1},
            {x:screenX+radius+5,y:screenY-radius-5,align:'left',baseline:'middle',left:screenX+radius+3,right:screenX+radius+7+labelWidth,top:screenY-radius-5-labelHeight/2,bottom:screenY-radius-5+labelHeight/2,dx:.7,dy:-.7},
            {x:screenX+radius+5,y:screenY+radius+5,align:'left',baseline:'middle',left:screenX+radius+3,right:screenX+radius+7+labelWidth,top:screenY+radius+5-labelHeight/2,bottom:screenY+radius+5+labelHeight/2,dx:.7,dy:.7},
            {x:screenX-radius-5,y:screenY-radius-5,align:'right',baseline:'middle',left:screenX-radius-7-labelWidth,right:screenX-radius-3,top:screenY-radius-5-labelHeight/2,bottom:screenY-radius-5+labelHeight/2,dx:-.7,dy:-.7},
            {x:screenX-radius-5,y:screenY+radius+5,align:'right',baseline:'middle',left:screenX-radius-7-labelWidth,right:screenX-radius-3,top:screenY+radius+5-labelHeight/2,bottom:screenY+radius+5+labelHeight/2,dx:-.7,dy:.7}
          ];
          const directionLength=Math.hypot(offsetX,offsetY)||1;
          candidates.sort((firstCandidate,secondCandidate)=>{
            const firstScore=firstCandidate.dx*offsetX/directionLength+firstCandidate.dy*offsetY/directionLength;
            const secondScore=secondCandidate.dx*offsetX/directionLength+secondCandidate.dy*offsetY/directionLength;
            return secondScore-firstScore;
          });
          const labelPlacement=candidates.find(candidate=>candidate.left>=4&&candidate.right<=width-4&&candidate.top>=4&&candidate.bottom<=height-4&&!reservedLabels.some(rect=>candidate.left<rect.right+3&&candidate.right>rect.left-3&&candidate.top<rect.bottom+3&&candidate.bottom>rect.top-3));
          if(labelPlacement){
            reservedLabels.push(labelPlacement);
            context.fillStyle=`rgba(218,230,220,${visible*.94})`;
            context.textAlign=labelPlacement.align;
            context.textBaseline=labelPlacement.baseline;
            context.fillText(label,labelPlacement.x,labelPlacement.y);
          }
        }
      }
    }
    const zoom=document.querySelector('#starZoomLevel');
    if(zoom)zoom.textContent=`${Math.round(starView.zoom*100)}%`;
    positionStarPopup();
  };
  starMapRefresh=draw;
  const localPoint=(event)=>{const rect=canvas.getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top}};
  const hitNode=(point)=>{
    const orderedNodes=nodes.filter(node=>node.type==='primary'||node.type==='satellite').sort((firstNode,secondNode)=>firstNode.point.depth-secondNode.point.depth);
    const distance=node=>Math.hypot(point.x-node.point.x,point.y-node.point.y);
    return (alternateRenderer&&orderedNodes.find(node=>distance(node)<node.radius))
      ||orderedNodes.find(node=>distance(node)<(node.hitRadius||(node.type==='primary'?25:17)));
  };
  canvas.addEventListener('wheel',event=>{event.preventDefault();starView.zoom=Math.max(minZoom,Math.min(maxZoom,starView.zoom*Math.exp(-event.deltaY*.001)));draw()},{passive:false,signal:controller.signal});
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0&&event.pointerType==='mouse')return;
    canvas.setPointerCapture(event.pointerId);
    const point=localPoint(event);pointers.set(event.pointerId,point);didDrag=false;
    if(pointers.size===1)gesture={type:'rotate',point,yaw:starView.yaw,pitch:starView.pitch};
    else if(pointers.size===2){const [firstPoint,secondPoint]=[...pointers.values()];gesture={type:'pinch',distance:Math.hypot(firstPoint.x-secondPoint.x,firstPoint.y-secondPoint.y)||1,zoom:starView.zoom}}
  },{signal:controller.signal});
  canvas.addEventListener('pointermove',event=>{
    const point=localPoint(event);
    if(!pointers.has(event.pointerId)){
      const hoveredNode=hitNode(point);
      canvas.style.cursor=hoveredNode?'pointer':'grab';
      alternateRenderer?.setHovered(hoveredNode);
      if(alternateRenderer&&reducedMotion.matches)draw();
      return;
    }
    pointers.set(event.pointerId,point);
    if(pointers.size===1&&gesture?.type==='rotate'){
      const dx=point.x-gesture.point.x,dy=point.y-gesture.point.y;
      if(Math.abs(dx)+Math.abs(dy)>4)didDrag=true;
      starView.yaw=gesture.yaw+dx*.008;
      starView.pitch=Math.max(-1.12,Math.min(1.12,gesture.pitch+dy*.006));
      canvas.style.cursor='grabbing';draw();
    }else if(pointers.size>=2&&gesture?.type==='pinch'){
      const [firstPoint,secondPoint]=[...pointers.values()];
      const distance=Math.hypot(firstPoint.x-secondPoint.x,firstPoint.y-secondPoint.y)||1;
      if(Math.abs(distance-gesture.distance)>3)didDrag=true;
      starView.zoom=Math.max(minZoom,Math.min(maxZoom,gesture.zoom*distance/gesture.distance));draw();
    }
  },{signal:controller.signal});
  const finishPointer=(event,cancelled=false)=>{
    const point=localPoint(event);
    if(pointers.has(event.pointerId))pointers.delete(event.pointerId);
    if(pointers.size===1){const remainingPoint=[...pointers.values()][0];gesture={type:'rotate',point:remainingPoint,yaw:starView.yaw,pitch:starView.pitch}}
    else if(!pointers.size)gesture=null;
    if(!cancelled&&!didDrag&&pointers.size===0){
      const node=hitNode(point);
      if(node?.type==='primary'){
        starView.selectedId=node.group.industryId;starView.selectedSatellite=null;starPopupOpen=true;updateStarDetail();
      }else if(node?.type==='satellite'){
        starView.selectedId=node.group.industryId;starView.selectedSatellite=node.satellite[0];starPopupOpen=true;updateStarDetail();
      }else if(starPopupOpen){
        starPopupOpen=false;updateStarDetail();
      }
    }
    if(!pointers.size){didDrag=false;canvas.style.cursor='grab'}
  };
  canvas.addEventListener('pointerup',event=>finishPointer(event),{signal:controller.signal});
  canvas.addEventListener('pointercancel',event=>finishPointer(event,true),{signal:controller.signal});
  canvas.addEventListener('pointerleave',()=>{alternateRenderer?.setHovered(null);if(alternateRenderer&&reducedMotion.matches)draw()},{signal:controller.signal});
  canvas.style.cursor='grab';
  resizeObserver=new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const animate=timestamp=>{
    if(timestamp-lastFrameTime>=(alternateRenderer?1000/30:40)&&(!alternateRenderer||!document.hidden&&!reducedMotion.matches)){animationTime=timestamp;lastFrameTime=timestamp;draw()}
    animationFrame=requestAnimationFrame(animate);
  };
  reducedMotion.addEventListener('change',draw,{signal:controller.signal});
  starMapCleanup=()=>{controller.abort();resizeObserver?.disconnect();cancelAnimationFrame(animationFrame);starMapRefresh=()=>{}};
  resize();
  animationFrame=requestAnimationFrame(animate);
  if(starPopupOpen)updateStarDetail();
}

function mapPoint(event,svg){
  const rect=svg.getBoundingClientRect();
  return {x:(event.clientX-rect.left)*720/rect.width,y:(event.clientY-rect.top)*520/rect.height};
}

function positionMapLabels(svg){
  const labels=[...svg.querySelectorAll('.map-city-label')];
  if(!labels.length)return;
  const svgBounds=svg.getBoundingClientRect();
  const scaleX=svgBounds.width/720;
  const scaleY=svgBounds.height/520;
  if(!scaleX||!scaleY)return;
  const entries=labels.map(group=>{
    const marker=group.querySelector('circle').getBoundingClientRect();
    const text=group.querySelector('text');
    const bounds=text.getBBox();
    return {
      group,
      text,
      leader:group.querySelector('.map-city-label-leader'),
      anchorX:marker.left+marker.width/2,
      anchorY:marker.top+marker.height/2,
      width:bounds.width,
      height:bounds.height
    };
  });
  const crowding=entry=>entries.reduce((count,other)=>count+(entry!==other&&Math.hypot(entry.anchorX-other.anchorX,entry.anchorY-other.anchorY)<92?1:0),0);
  const center=entries.reduce((sum,entry)=>({x:sum.x+entry.anchorX/entries.length,y:sum.y+entry.anchorY/entries.length}),{x:0,y:0});
  const directions=[
    {x:1,y:0,anchor:'start'}, {x:-1,y:0,anchor:'end'},
    {x:0,y:-1,anchor:'middle'}, {x:0,y:1,anchor:'middle'},
    {x:.707,y:-.707,anchor:'start'}, {x:.707,y:.707,anchor:'start'},
    {x:-.707,y:-.707,anchor:'end'}, {x:-.707,y:.707,anchor:'end'}
  ];
  const radii=[12,22,34,47,61,77,94,112,132,154];
  entries.sort((first,second)=>crowding(second)-crowding(first)||second.width-first.width||first.group.dataset.cityId.localeCompare(second.group.dataset.cityId));
  const reserved=[];
  const controls=svg.parentElement.querySelector('.map-controls')?.getBoundingClientRect();
  if(controls)reserved.push({left:controls.left-4,right:controls.right+4,top:controls.top-4,bottom:controls.bottom+4});
  entries.forEach(entry=>{
    const preferredX=entry.anchorX-center.x;
    const preferredY=entry.anchorY-center.y;
    const preferredLength=Math.hypot(preferredX,preferredY)||1;
    let best=null;
    radii.forEach(radius=>directions.forEach(direction=>{
      const dx=direction.x*radius;
      const dy=direction.y*radius;
      const textX=entry.anchorX+dx;
      const textY=entry.anchorY+dy;
      const left=direction.anchor==='start'?textX:direction.anchor==='end'?textX-entry.width:textX-entry.width/2;
      const candidate={left,right:left+entry.width,top:textY-entry.height/2,bottom:textY+entry.height/2,dx,dy,anchor:direction.anchor,radius};
      const overflow=Math.max(0,svgBounds.left+5-candidate.left)+Math.max(0,candidate.right-svgBounds.right+5)+Math.max(0,svgBounds.top+5-candidate.top)+Math.max(0,candidate.bottom-svgBounds.bottom+5);
      const overlap=reserved.reduce((total,placed)=>total+Math.max(0,Math.min(candidate.right,placed.right+4)-Math.max(candidate.left,placed.left-4))*Math.max(0,Math.min(candidate.bottom,placed.bottom+3)-Math.max(candidate.top,placed.top-3)),0);
      const outward=(direction.x*preferredX+direction.y*preferredY)/preferredLength;
      const score=overlap*100+overflow*1000+radius*.16-outward*2;
      if(!best||score<best.score)best={...candidate,score};
    }));
    const padded={left:best.left-3,right:best.right+3,top:best.top-2,bottom:best.bottom+2};
    reserved.push(padded);
    entry.text.setAttribute('x',best.dx.toFixed(2));
    entry.text.setAttribute('y',best.dy.toFixed(2));
    entry.text.setAttribute('text-anchor',best.anchor);
    entry.text.setAttribute('dominant-baseline','middle');
    const endX=best.dx===0?0:best.dx-Math.sign(best.dx)*Math.min(entry.width/2,7);
    const endY=best.dy===0?0:best.dy-Math.sign(best.dy)*Math.min(entry.height/2,4);
    entry.leader.setAttribute('d',`M 0 0 L ${endX.toFixed(2)} ${endY.toFixed(2)}`);
  });
}

function clampMapTranslation(){
  const minX=mapScale<1?0:720*(1-mapScale);
  const maxX=mapScale<1?720*(1-mapScale):0;
  const minY=mapScale<1?0:520*(1-mapScale);
  const maxY=mapScale<1?520*(1-mapScale):0;
  mapTranslateX=Math.max(minX,Math.min(maxX,mapTranslateX));
  mapTranslateY=Math.max(minY,Math.min(maxY,mapTranslateY));
}

function updateMapTransform(){
  const svg=document.querySelector('.hubei-map-svg');
  if(!svg)return;
  clampMapTranslation();
  svg.querySelector('.map-transform').setAttribute('transform',`translate(${mapTranslateX} ${mapTranslateY}) scale(${mapScale})`);
  const hubeiTransform=window.chinaMapViewport?.hubeiTransform||{sx:1,sy:1};
  const svgBounds=svg.getBoundingClientRect();
  const scaleX=svgBounds.width/720;
  const scaleY=svgBounds.height/520;
  const labelCounterScale=`scale(${(1/(hubeiTransform.sx*mapScale*scaleX)).toFixed(6)} ${(1/(hubeiTransform.sy*mapScale*scaleY)).toFixed(6)})`;
  svg.querySelectorAll('.map-city-label-visual').forEach(label=>label.setAttribute('transform',labelCounterScale));
  svg.classList.toggle('show-city-labels',mapScale>=4);
  if(mapScale>=4)positionMapLabels(svg);
  const zoomLabel=svg.parentElement.querySelector('.map-zoom-level');
  if(zoomLabel)zoomLabel.value=`${Math.round(mapScale*100)}%`;
  svg.parentElement.querySelector('[data-map-control="out"]').disabled=mapScale<=0.72;
  svg.parentElement.querySelector('[data-map-control="in"]').disabled=mapScale>=8;
}

function zoomMap(factor,point){
  const svg=document.querySelector('.hubei-map-svg');
  if(!svg)return;
  const anchor=point||{x:360,y:260};
  const nextScale=Math.max(0.72,Math.min(8,mapScale*factor));
  const ratio=nextScale/mapScale;
  mapTranslateX=anchor.x-(anchor.x-mapTranslateX)*ratio;
  mapTranslateY=anchor.y-(anchor.y-mapTranslateY)*ratio;
  mapScale=nextScale;
  updateMapTransform();
}

function initializeMapInteraction(){
  if(mapStyle==='2'){
    const container=document.querySelector('.globe-map-panel');
    if(!container)return;
    const generation=globeMapGeneration;
    import('./globe-map.js?v=20261024-8').then(({createGlobeMap})=>{
      if(generation!==globeMapGeneration||!container.isConnected)return;
      globeMapController=createGlobeMap({container,provinces:window.chinaMapFeatures||[],cities:hubeiMapUnits,transform:window.chinaMapViewport.hubeiTransform,maritimePath:window.chinaMapMaritimePath,view:globeMapView,language,cityName:mapCityName,onNavigate:id=>{location.hash=`city/${id}`}});
    }).catch(error=>{
      if(generation!==globeMapGeneration||!container.isConnected)return;
      console.error('Globe map initialization failed',error);
      const status=container.querySelector('.globe-status');
      status.hidden=false;
      status.textContent=language==='en'?'The globe could not load. Please choose Style 1.':'球面地图暂时无法加载，请切换样式一。';
    });
    return;
  }
  const svg=document.querySelector('.hubei-map-svg');
  if(!svg)return;
  updateMapTransform();
  mapResizeObserver=new ResizeObserver(()=>updateMapTransform());
  mapResizeObserver.observe(svg);
  svg.addEventListener('wheel',event=>{
    event.preventDefault();
    zoomMap(Math.exp(-event.deltaY*0.0012),mapPoint(event,svg));
  },{passive:false});
  svg.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    event.preventDefault();
    svg.setPointerCapture(event.pointerId);
    mapPointers.set(event.pointerId,mapPoint(event,svg));
    mapDragDetected=false;
    if(mapPointers.size===1){
      const point=mapPointers.get(event.pointerId);
      mapGesture={type:'drag',pointerId:event.pointerId,startX:point.x,startY:point.y,translateX:mapTranslateX,translateY:mapTranslateY,cityHref:event.target.closest('.map-city-shape')?.getAttribute('href')||''};
    }else if(mapPointers.size===2){
      const [first,second]=[...mapPointers.values()];
      mapGesture={type:'pinch',startScale:mapScale,translateX:mapTranslateX,translateY:mapTranslateY,startDistance:Math.hypot(second.x-first.x,second.y-first.y)||1,startCenter:{x:(first.x+second.x)/2,y:(first.y+second.y)/2}};
    }
  });
  svg.addEventListener('pointermove',event=>{
    if(!mapPointers.has(event.pointerId))return;
    const point=mapPoint(event,svg);
    mapPointers.set(event.pointerId,point);
    if(mapGesture?.type==='drag'&&mapPointers.size===1){
      const distance=Math.hypot(point.x-mapGesture.startX,point.y-mapGesture.startY);
      if(distance>2)mapDragDetected=true;
      mapTranslateX=mapGesture.translateX+point.x-mapGesture.startX;
      mapTranslateY=mapGesture.translateY+point.y-mapGesture.startY;
      updateMapTransform();
    }else if(mapGesture?.type==='pinch'&&mapPointers.size>=2){
      const [first,second]=[...mapPointers.values()];
      const center={x:(first.x+second.x)/2,y:(first.y+second.y)/2};
      const distance=Math.hypot(second.x-first.x,second.y-first.y)||1;
      const nextScale=Math.max(0.72,Math.min(8,mapGesture.startScale*distance/mapGesture.startDistance));
      const ratio=nextScale/mapGesture.startScale;
      mapTranslateX=center.x-(mapGesture.startCenter.x-mapGesture.translateX)*ratio;
      mapTranslateY=center.y-(mapGesture.startCenter.y-mapGesture.translateY)*ratio;
      mapScale=nextScale;
      mapDragDetected=true;
      updateMapTransform();
    }
  });
  const finishPointer=event=>{
    if(!mapPointers.has(event.pointerId))return;
    const tappedCityHref=event.type==='pointerup'&&mapGesture?.type==='drag'&&!mapDragDetected?mapGesture.cityHref:'';
    mapPointers.delete(event.pointerId);
    if(mapPointers.size===1){
      const [pointerId,point]=[...mapPointers.entries()][0];
      mapGesture={type:'drag',pointerId,startX:point.x,startY:point.y,translateX:mapTranslateX,translateY:mapTranslateY};
    }else if(mapPointers.size===0){
      if(mapDragDetected){
        suppressMapClick=true;
        setTimeout(()=>{suppressMapClick=false},0);
      }
      mapGesture=null;
    }
    if(tappedCityHref)location.hash=tappedCityHref;
  };
  svg.addEventListener('pointerup',finishPointer);
  svg.addEventListener('pointercancel',finishPointer);
  svg.addEventListener('click',event=>{
    if(!suppressMapClick)return;
    event.preventDefault();
    event.stopPropagation();
  },true);
}

function renderCityDetail(id){
  const city=cityById(id);
  return city?renderSourceCity(city):renderCities();
}

function renderCompanies(query){
  return renderSourceCompanyDirectory(query);
}

function renderCompanyDetail(id){
  const company=companyById(id);if(!company)return renderCompanies();
  if(company.sourceId)return renderSourceCompany(company);
  const sample=company.sourceKey==='optical-comms';
  const relatedIndustry=sample?null:company.industryId?industryById(company.industryId):industries.find(industry=>industry.companies.includes(id));
  const industryName=language==='en'?(relatedIndustry?.nameEn||relatedIndustry?.name||'Industry link pending'):(relatedIndustry?.name||'行业关系待后台确认');
  const emptyProfile=sample?(language==='en'?'Only the company name and sector classifications have been migrated. A verified profile is pending.':'当前仅迁入企业名称与行业分类，详细企业介绍待补充审核。'):(language==='en'?'A verified full description has not been migrated, so no details are inferred.':'原站专题列示了该企业名称或方向。本演示未迁入经核验的完整企业介绍，避免补写未经确认的事实。');
  const sourceNote=sample?(language==='en'?'Source: company appendix in the supplied optical communications supplement. Company details and links require verification.':'来源：用户提供的光通信分册企业附录。企业详细介绍与关联关系待核验。'):(language==='en'?'Source: company listing/profile in the original Hubei Industry Knowledge Base AI page. Verify market, listing and technology information before publication.':'来源：湖北产业知识库原站人工智能专题企业列表/档案。原文中的市场、上市和技术信息均需在正式发布前复核。');
  const companyIntro=language==='en'&&sample?'This company is listed in the supplied optical communications appendix under the sector categories shown above. A full company profile is pending review.':company.intro;
  const relationshipDetails=sample?`<div class="profile-stat"><b>${language==='en'?'Appendix sector classification':'附录行业分类'}</b>${language==='en'&&company.fieldEn?company.fieldEn:company.field}</div><div class="profile-stat"><b>${language==='en'?'Appendix chapters':'附录章节'}</b>${company.chapter}</div>`:`<div class="profile-stat"><b>${language==='en'?'Industry':'所属行业'}</b>${relatedIndustry?`<a href="#industry/${relatedIndustry.id}">${industryName}</a>`:industryName}</div><div class="profile-stat"><b>${language==='en'?'City':'所在城市'}</b>${company.city?`<a href="#city/${cities.find(city=>city.name===company.city)?.id||'wuhan'}">${company.city}</a>`:language==='en'?'Pending verification':'待核验后关联'}</div>`;
  return `${backLink('companies',language==='en'?'Back to company directory':'返回企业目录')}<div class="detail-heading"><div class="view-kicker">${language==='en'?'COMPANY PROFILE':'企业档案'} · ${language==='en'&&company.fieldEn?company.fieldEn:company.field}</div><h1>${company.name}</h1><p>${company.city?`${company.city} · `:''}${language==='en'&&company.fieldEn?company.fieldEn:company.field}</p><div class="tag-list"><span class="tag">${sample?(language==='en'?'Optical communications appendix sample':'光通信分册样例'):language==='en'?'Listed in original AI profile':'原站人工智能专题列示'}</span>${company.city?`<a class="tag" href="#city/${cities.find(city=>city.name===company.city)?.id||'wuhan'}">${company.city}</a>`:''}</div></div><div class="company-profile"><section class="panel detail-card"><h2>${language==='en'?'Company overview':'企业介绍'}</h2><p>${companyIntro}</p>${company.details?company.details.map(detail=>`<h3>${detail[0]}</h3><p>${detail[1]}</p>`).join(''):`<div class="empty-state">${emptyProfile}</div>`}<div class="source-note">${sourceNote}</div></section><aside class="panel detail-card"><h2>${language==='en'?'Relationships and source':'关联信息与来源'}</h2>${relationshipDetails}${sample?`<div class="profile-stat"><b>${language==='en'?'Source':'来源'}</b>${language==='en'?'Optical communications company appendix':'光通信分册企业附录'}</div>`:''}<div class="profile-stat"><b>${language==='en'?'Content status':'资料状态'}</b>${sample?(language==='en'?'Appendix sample · Pending verification':'附录样例 · 待核验'):(language==='en'?'Migrated sample · Pending verification':'原站迁移样例 · 待核验')}</div></aside></div>`;
}

function answerFor(question,responseLanguage=language){
  const text=question.trim();
  if(responseLanguage==='en'){
    const company=companies.find(item=>text.toLowerCase().includes((english[item.name]||item.name).toLowerCase())||text.includes(item.name)||text.includes(item.name.replace('科技有限公司','')));
    const city=cities.find(item=>text.toLowerCase().includes((english[item.name]||item.name).toLowerCase())||text.includes(item.name));
    if(company)return {body:`${english[company.name]||company.name} is listed in the original AI industry profile under ${english[company.field]||company.field}. ${english[company.intro]||'Its detailed profile is being reviewed.'}`,sources:[['Company profile',`company/${company.id}`],['Industry profile','industry/artificial-intelligence']]};
    if(city)return {body:english[city.intro]||`The original profile contains planning information related to ${english[city.name]||city.name}.`,sources:[[`${english[city.name]||city.name} city profile`,`city/${city.id}`],['Industry profile','industry/artificial-intelligence']]};
    if(/plan|layout|wuhan|xiangyang|yichang|规划|布局|武汉|襄阳|宜昌/i.test(text))return {body:'The source plan describes “one core, two wings, coordinated development”: Wuhan as the core, with differentiated application services in Xiangyang and Yichang. This is a source plan, not a confirmation of current project status.',sources:[['Hubei industry profile','industry/artificial-intelligence'],['Wuhan','city/wuhan'],['Xiangyang','city/xiangyang'],['Yichang','city/yichang']]};
    if(/upstream|infrastructure|chip|compute|supply chain|上游|基础|芯片|算力/i.test(text))return {body:'The source AI profile divides the supply chain into infrastructure, technology and application layers. Infrastructure includes AI chips, sensors, servers, cloud computing and data infrastructure. It mentions Wuhan’s advanced computing center and Yichang’s compute-storage data center cluster. Verify all details against the source date.',sources:[['AI industry profile','industry/artificial-intelligence'],['Supply chain','industry/artificial-intelligence']]};
    return {body:'This demo contains selected, migrated AI industry information only. It is not connected to a live LLM or search service, so I will not supplement the answer with outside information. Try asking about AI supply chains, Hubei plans, listed companies or the example cities.',sources:[['Industries','industries'],['Cities','cities'],['Companies','companies']]};
  }
  const company=companies.find(item=>text.includes(item.name)||text.includes(item.name.replace('科技有限公司','')));
  const city=cities.find(item=>text.includes(item.name));
  if(company)return {body:`${company.name}在原站人工智能专题中列示，领域标签为“${company.field}”。${company.intro}`,sources:[['企业档案',`company/${company.id}`],['行业专题','industry/artificial-intelligence']]};
  if(city)return {body:city.intro,sources:[[`${city.name}城市专题`,`city/${city.id}`],['行业专题','industry/artificial-intelligence']]};
  if(/规划|布局/.test(text))return {body:'原专题提出“一主引领、两翼驱动、全域协同”：以武汉为核心，支持襄阳、宜昌发展差异化、特色化应用服务体系。该表述来自原文规划内容，不等同于当前项目进展。',sources:[['湖北产业布局','industry/artificial-intelligence'],['武汉','city/wuhan'],['襄阳','city/xiangyang'],['宜昌','city/yichang']]};
  if(/上游|基础|芯片|算力/.test(text))return {body:'原人工智能专题将产业链分为基础层、技术层和应用层。基础层包括 AI 芯片、传感器、服务器、云计算和数据算力；原文提到武汉先进算力中心、宜昌“存算一体”数据中心集群。相关设施与企业信息均需结合原文时间口径复核。',sources:[['人工智能行业详情','industry/artificial-intelligence'],['基础层产业链','industry/artificial-intelligence']]};
  return {body:'当前演示知识库仅迁入人工智能专题的部分站内资料，尚未连接真实 LLM 和检索服务。我不能基于外网或模型记忆补充答案；请改问人工智能产业链、湖北规划、已列示企业或示例城市。',sources:[['浏览行业','industries'],['浏览城市','cities'],['浏览企业','companies']]};
}

function renderAnswer(question){
  const cleanQuestion=question.trim();if(!cleanQuestion)return;
  stopChatDemo();
  chatHistory.push({question:cleanQuestion,zh:answerFor(cleanQuestion,'zh'),en:answerFor(cleanQuestion,'en')});
  if(routeParts()[0]==='home'){
    homeChatExpanded=true;
    root.innerHTML=renderHome();
    applyLanguage();
    const messages=document.querySelector('#chatMessages');
    messages.scrollTop=messages.scrollHeight;
    document.querySelector('#questionInput').focus();
    return;
  }
  if(routeParts()[0]!=='assistant'){
    location.hash='assistant';
    return;
  }
  render();
  const messages=document.querySelector('#chatMessages');
  messages.scrollTop=messages.scrollHeight;
  document.querySelector('#questionInput').focus();
}

function currentRoot(route){const section=route.split('/')[0];return ['industry','topic'].includes(section)?'industries':section==='city'?'cities':section==='company'?'companies':section==='policy'?'policies':section==='assistant'?'home':section}
function render(){
  stopChatDemo();
  closeCityIndustryDialog();
  globeMapGeneration++;
  globeMapController?.destroy();
  globeMapController=null;
  mapPointers.clear();
  mapGesture=null;
  mapResizeObserver?.disconnect();
  mapResizeObserver=null;
  starMapCleanup();
  if(routeParts()[0]!=='explore-stars')starPopupOpen=false;
  const parts=routeParts();const section=parts[0];const id=parts[1];
  const activeSection=['industries','cities','companies','policies'].includes(currentRoot(section))?'home-directory':currentRoot(section);
  navLinks.forEach(link=>{const active=link.dataset.section===activeSection;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current')});
  if(section==='home'||section==='home-directory')root.innerHTML=renderHome();
  else if(section==='explore-map')root.innerHTML=renderExploreMap();
  else if(section==='explore-stars')root.innerHTML=renderExploreStars();
  else if(section==='assistant')root.innerHTML=renderAssistant();
  else if(section==='new-materials')root.innerHTML=renderAbout();
  else if(section==='industries')root.innerHTML=renderIndustries();
  else if(section==='industry')root.innerHTML=renderIndustryDetail(id);
  else if(section==='cities')root.innerHTML=renderCities();
  else if(section==='city')root.innerHTML=renderCityDetail(id);
  else if(section==='policies')root.innerHTML=renderPolicies();
  else if(section==='policy')root.innerHTML=renderPolicyDetail(id);
  else if(section==='companies')root.innerHTML=renderCompanies();
  else if(section==='company')root.innerHTML=renderCompanyDetail(id);
  else root.innerHTML=renderHome();
  applyLanguage();
  if(section==='home-directory')requestAnimationFrame(scrollHomeDirectory);
  else if(section==='home')setTimeout(()=>window.scrollTo({top:0,behavior:'smooth'}),40);
  else if(['policies','policy','companies','company','industry','city'].includes(section))window.scrollTo({top:0,behavior:'instant'});
  if(section==='explore-map')initializeMapInteraction();
  if(section==='explore-stars')initializeStarMap();
}

document.addEventListener('submit',event=>{
  if(event.target.id!=='askForm')return;
  event.preventDefault();
  if(activeChatDemo)return;
  renderAnswer(new FormData(event.target).get('question')||'');
});
document.addEventListener('click',event=>{
  if(event.target.closest('[data-chat-demo]')){startChatDemo();return}
  const aboutTarget=event.target.closest('[data-about-target]');
  if(aboutTarget){
    event.preventDefault();
    document.getElementById(aboutTarget.dataset.aboutTarget)?.scrollIntoView({behavior:'smooth',block:'start'});
    return;
  }
  const homeNav=event.target.closest('[data-knowledge-home]');
  if(homeNav){event.preventDefault();if(routeParts()[0]!=='home')location.hash='home';else window.scrollTo({top:0,behavior:'smooth'});return}
  const directoryNav=event.target.closest('[data-home-directory]');
  if(directoryNav){event.preventDefault();if(routeParts()[0]==='home-directory')scrollHomeDirectory();else location.hash='home-directory';return}
  const starPopupClose=event.target.closest('[data-star-close]');
  if(starPopupClose){
    starPopupOpen=false;
    updateStarDetail();
    return;
  }
  const satelliteTrigger=event.target.closest('[data-star-satellite]');
  if(satelliteTrigger){
    starView.selectedSatellite=satelliteTrigger.dataset.starSatellite;
    starPopupOpen=true;
    updateStarDetail();
    return;
  }
  const starControl=event.target.closest('[data-star-control]');
  if(starControl){
    if(starControl.dataset.starControl==='zoom-in')starView.zoom=Math.min(2.3,starView.zoom*1.2);
    else if(starControl.dataset.starControl==='zoom-out')starView.zoom=Math.max(.55,starView.zoom/1.2);
    else if(starControl.dataset.starControl==='reset'){starView={yaw:-0.32,pitch:0.18,zoom:1,selectedId:'software-ai',selectedSatellite:null};starPopupOpen=false}
    starMapRefresh();
    updateStarDetail();
    return;
  }
  const mapControl=event.target.closest('[data-map-control]');
  if(mapControl){
    if(mapStyle==='2'){
      if(mapControl.dataset.mapControl==='in')globeMapController?.zoomBy(1.25);
      else if(mapControl.dataset.mapControl==='out')globeMapController?.zoomBy(.8);
      else globeMapController?.reset();
      return;
    }
    if(mapControl.dataset.mapControl==='in')zoomMap(1.25);
    else if(mapControl.dataset.mapControl==='out')zoomMap(0.8);
    else {mapScale=mapInitialScale;mapTranslateX=360-mapFocus.x*mapInitialScale;mapTranslateY=260-mapFocus.y*mapInitialScale;updateMapTransform()}
    return;
  }
  const historyBack=event.target.closest('[data-history-back]');
  if(historyBack){
    event.preventDefault();
    if(previousAppHash&&previousAppHash!==location.hash)history.back();
    else location.hash=historyBack.dataset.historyFallback||'home-directory';
    return;
  }
  const languageTrigger=event.target.closest('#languageTrigger');
  if(languageTrigger){
    const menu=document.querySelector('#languageOptions');
    const isExpanded=languageTrigger.getAttribute('aria-expanded')==='true';
    languageTrigger.setAttribute('aria-expanded',String(!isExpanded));
    menu.hidden=isExpanded;
    return;
  }
  const languageOption=event.target.closest('#languageOptions [data-language]');
  if(languageOption){
    language=languageOption.dataset.language;
    localStorage.setItem('industry-map-language',language);
    document.querySelector('#languageTrigger').setAttribute('aria-expanded','false');
    document.querySelector('#languageOptions').hidden=true;
    render();
    return;
  }
  if(!event.target.closest('#languagePicker')){
    document.querySelector('#languageTrigger').setAttribute('aria-expanded','false');
    document.querySelector('#languageOptions').hidden=true;
  }
  const guideTab=event.target.closest('[data-home-guide]');
  if(guideTab){
    stopChatDemo();
    homeGuideMode=guideTab.dataset.homeGuide;
    root.innerHTML=renderHome();
    applyLanguage();
    return;
  }
  const questionButton=event.target.closest('[data-question]');
  if(questionButton)renderAnswer(questionButton.dataset.question);
});
document.addEventListener('input',event=>{
  if(event.target.id==='companySearch'){
    const cursor=event.target.selectionStart;
    root.innerHTML=renderCompanies(event.target.value);
    const next=document.querySelector('#companySearch');next.focus();next.setSelectionRange(cursor,cursor);
    applyLanguage();
  }else if(event.target.id==='policySearch'){
    const cursor=event.target.selectionStart;
    const level=document.querySelector('#policyLevel').value;
    root.innerHTML=renderPolicies(event.target.value,level);
    const next=document.querySelector('#policySearch');next.focus();next.setSelectionRange(cursor,cursor);
    applyLanguage();
  }
});
document.addEventListener('change',event=>{
  if(event.target.id==='mapStyleSelect'){
    mapStyle=event.target.value==='1'?'1':'2';
    localStorage.setItem('industry-map-map-style',mapStyle);
    render();
    document.querySelector('#mapStyleSelect')?.focus({preventScroll:true});
  }else if(event.target.id==='starStyleSelect'){
    starStyle=event.target.value==='2'?'2':'1';
    localStorage.setItem('industry-map-star-style',starStyle);
    render();
    document.querySelector('#starStyleSelect')?.focus({preventScroll:true});
  }else if(['companySector','companyCity','companyCollection'].includes(event.target.id)){
    const query=document.querySelector('#companySearch').value;
    const filterKey={companySector:'industry',companyCity:'city',companyCollection:'collection'}[event.target.id];
    companyDirectoryState[filterKey]=event.target.value;
    companyDirectoryState.page=1;
    root.innerHTML=renderCompanies(query);
    applyLanguage();
  }else if(event.target.id==='policyLevel'){
    const query=document.querySelector('#policySearch').value;
    const selected=event.target.value;
    root.innerHTML=renderPolicies(query,selected);
    document.querySelector('#policyLevel').value=selected;
    applyLanguage();
  }
});
window.addEventListener('hashchange',()=>{
  previousAppHash=currentAppHash;
  currentAppHash=location.hash||'#home';
  render();
});
initializeSourceContent();
render();
