import { defineConfig } from 'vitepress'

const blogAssistantRepo =
  'https://github.com/Keekuun/keekuun.github.io/tree/master/apps/blog-assistant'

export default defineConfig({
  title: 'AI Lab',
  description: '前端开发者的 AI Agent 学习笔记与实战项目',
  lang: 'zh-CN',
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
    ['link', { rel: 'icon', href: '/favicon.ico', sizes: '32x32' }],
    ['link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }],
  ],

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'AI Lab',

    nav: [
      { text: '首页', link: '/' },
      { text: '学习路线', link: '/ai-agent-learning-roadmap' },
      { text: '实验', link: '/examples' },
      { text: 'LangChain', link: '/langchain/' },
      { text: 'LangGraph', link: '/langgraph/' },
      { text: 'Mastra', link: '/mastra/' },
      {
        text: '项目',
        items: [
          {
            text: 'blog-assistant',
            link: blogAssistantRepo,
          },
          {
            text: 'kb-search',
            link: 'https://github.com/Keekuun/keekuun.github.io/tree/master/apps/kb-search',
          },
          {
            text: '主博客',
            link: 'https://blog.zkkysqs.top/',
          },
        ],
      },
    ],

    sidebar: {
      '/': [
        {
          text: '总览',
          items: [
            { text: '系列总索引', link: '/' },
            { text: '学习路线图', link: '/ai-agent-learning-roadmap' },
            { text: '可运行实验', link: '/examples' },
            { text: 'Skills 指南', link: '/skills-guide' },
            { text: 'GitHub AI 库', link: '/github-ai' },
          ],
        },
        {
          text: '基础入门 01～03',
          collapsed: false,
          items: [
            { text: '01 前端 AI 入门', link: '/01-frontend-ai-introduction' },
            { text: '02 Transformer', link: '/02-transformer-explained' },
            { text: '03 模型选型', link: '/03-llm-comparison-guide' },
          ],
        },
        {
          text: 'Prompt 04～06',
          collapsed: true,
          items: [
            { text: '04 Prompt 指南', link: '/04-prompt-engineering-guide' },
            { text: '05 高级 Prompt', link: '/05-advanced-prompt-techniques' },
            { text: '06 Prompt 调试', link: '/06-prompt-debugging-optimization' },
          ],
        },
        {
          text: 'Agent 核心 07～10',
          collapsed: true,
          items: [
            { text: '07 Agent 架构', link: '/07-ai-agent-architecture' },
            { text: '08 第一个 Agent', link: '/08-build-first-agent' },
            { text: '09 Tools 设计', link: '/09-tools-system-design' },
            { text: '10 Memory & Planning', link: '/10-memory-planning-agent' },
          ],
        },
        {
          text: 'RAG 与进阶 11～14',
          collapsed: true,
          items: [
            { text: 'RAG 博客实战', link: '/rag-blog-knowledge-search' },
            { text: '11 RAG 进阶', link: '/11-advanced-rag-patterns' },
            { text: '12 Multi-Agent', link: '/12-multi-agent-systems' },
            { text: '13 Memory 进阶', link: '/13-advanced-memory' },
            { text: '14 WebAI', link: '/14-webai-and-edge-inference' },
          ],
        },
        {
          text: '框架生态 15～16、27',
          collapsed: true,
          items: [
            { text: '15 LangChain 生态', link: '/15-langchain-js-guide' },
            { text: '16 LangGraph 实战', link: '/16-langgraphjs-practice' },
            { text: '27 Mastra 速览', link: '/27-mastra-typescript-agent-framework' },
          ],
        },
        {
          text: '产品化 17～19',
          collapsed: true,
          items: [
            { text: '17 Chatbot UI', link: '/17-build-production-chatbot-ui' },
            { text: '18 上线 Checklist', link: '/18-agent-production-checklist' },
            { text: '19 收官实战', link: '/19-blog-ai-assistant-capstone' },
          ],
        },
        {
          text: '扩展 20～24',
          collapsed: true,
          items: [
            { text: '20 Vercel AI SDK', link: '/20-vercel-ai-sdk-guide' },
            { text: '21 多模态', link: '/21-multimodal-interaction' },
            { text: '22 Agent Eval', link: '/22-agent-eval-regression' },
            { text: '23 Skills 桥接', link: '/23-skills-agent-bridge' },
            { text: '24 传统 Web 接入', link: '/24-traditional-web-ai-integration' },
          ],
        },
        {
          text: '深潜 25～26',
          collapsed: true,
          items: [
            { text: '25 Langfuse', link: '/25-langfuse-practice' },
            { text: '26 CopilotKit', link: '/26-copilotkit-guide' },
          ],
        },
        {
          text: 'AI 工程 28～31',
          collapsed: false,
          items: [
            { text: '28 LLM 工程基础', link: '/28-llm-engineering-foundations' },
            { text: '29 RAG 数据与评测', link: '/29-rag-data-and-evaluation' },
            { text: '30 可靠性与安全', link: '/30-agent-reliability-and-security' },
            { text: '31 MCP 与协议', link: '/31-mcp-and-agent-protocols' },
            { text: '32 ACP 与编辑器协议', link: '/32-acp-agent-client-protocol' },
          ],
        },
      ],

      '/langchain/': [
        { text: 'LangChain 专系列', link: '/langchain/' },
        { text: '01 Runnable & LCEL', link: '/langchain/01-runnable-lcel' },
        { text: '02 Chat Models', link: '/langchain/02-chat-models' },
        { text: '03 Messages', link: '/langchain/03-messages' },
        { text: '04 Prompt Templates', link: '/langchain/04-prompt-templates' },
        { text: '05 Tools', link: '/langchain/05-tools' },
        { text: '06 Documents', link: '/langchain/06-documents' },
        { text: '07 Text Splitters', link: '/langchain/07-text-splitters' },
        { text: '08 Embeddings', link: '/langchain/08-embeddings' },
        { text: '09 Vector Stores', link: '/langchain/09-vector-stores' },
        { text: '10 Output Parsers', link: '/langchain/10-output-parsers' },
        { text: '11 Callbacks & LangSmith', link: '/langchain/11-callbacks-langsmith' },
        { text: '12 Retrievers', link: '/langchain/12-retrievers' },
        { text: '13 会话历史', link: '/langchain/13-message-history' },
        { text: '14 Community 集成', link: '/langchain/14-community-integrations' },
        { text: '15 LangSmith Eval', link: '/langchain/15-langsmith-eval' },
        { text: '16 Runnable 分支', link: '/langchain/16-runnable-branch' },
      ],

      '/langgraph/': [
        { text: 'LangGraph 专系列', link: '/langgraph/' },
        { text: '01 State & Annotation', link: '/langgraph/01-state-and-annotation' },
        { text: '02 StateGraph API', link: '/langgraph/02-stategraph-api' },
        { text: '03 条件边', link: '/langgraph/03-conditional-edges' },
        { text: '04 ReAct & ToolNode', link: '/langgraph/04-react-toolnode' },
        { text: '05 Checkpoint', link: '/langgraph/05-checkpointer' },
        { text: '06 流式', link: '/langgraph/06-streaming' },
        { text: '07 子图', link: '/langgraph/07-subgraphs' },
        { text: '08 人机协同', link: '/langgraph/08-human-in-the-loop' },
        { text: '09 生产 Checkpointer', link: '/langgraph/09-production-checkpointer' },
        { text: '10 Command API', link: '/langgraph/10-command-api' },
        { text: '11 调试', link: '/langgraph/11-debugging-time-travel' },
        { text: '12 Route 示例', link: '/langgraph/12-full-route-example' },
        { text: '13 Redis / Neon', link: '/langgraph/13-redis-neon-deployment' },
      ],

      '/mastra/': [
        { text: 'Mastra 专系列', link: '/mastra/' },
        { text: '01 实例与 Studio', link: '/mastra/01-mastra-instance-and-studio' },
        { text: '02 Agent API', link: '/mastra/02-agents-api' },
        { text: '03 Tools', link: '/mastra/03-tools' },
        { text: '04 Workflows', link: '/mastra/04-workflows' },
        { text: '05 Memory', link: '/mastra/05-memory' },
        { text: '06 RAG & Vector', link: '/mastra/06-rag-vector' },
        { text: '07 Observability', link: '/mastra/07-observability-evals' },
        { text: '08 Next.js 集成', link: '/mastra/08-nextjs-integration' },
      ],

      '/pi-ai/': [
        { text: 'Pi 深度解析', link: '/pi-ai/' },
        { text: '01 架构拆解', link: '/pi-ai/01-architecture' },
        { text: '02 可扩展性', link: '/pi-ai/02-extensibility' },
        { text: '03 SDK 嵌入', link: '/pi-ai/03-sdk-embedding' },
      ],

      '/deepseek-harness/': [
        { text: 'DeepSeek Harness', link: '/deepseek-harness/' },
        { text: '01 Cordis 插件系统', link: '/deepseek-harness/01-cordis-plugin-system' },
        { text: '02 Harness 全景与落地', link: '/deepseek-harness/02-harness-overview' },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Keekuun/ai-lab' },
    ],

    footer: {
      message: 'MIT License',
      copyright: '前端Jeek · ai.zkkysqs.top',
    },

    search: {
      provider: 'local',
    },
  },

  markdown: {
    mermaid: true,
    lineNumbers: true,
  },

  ignoreDeadLinks: [
    /^http:\/\/localhost/,
  ],
})
