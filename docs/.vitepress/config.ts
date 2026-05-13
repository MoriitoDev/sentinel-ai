import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Sentinel-AI',
  description: 'Detect AI hallucinated npm packages & vulnerabilities in your codebase.',
  cleanUrls: true,

  markdown: {
    theme: {
      light: 'catppuccin-latte',
      dark: 'catppuccin-mocha',
    },
  },

  themeConfig: {
    logo: false,
    siteTitle: 'Sentinel-AI',

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/installation' },
      { text: 'GitHub', link: 'https://github.com/MoriitoDev/sentinel-ai' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Usage', link: '/guide/usage' },
            { text: 'Guard', link: '/guide/guard' },
            { text: 'Concepts', link: '/guide/concepts' },
            { text: 'Architecture', link: '/guide/architecture' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/MoriitoDev/sentinel-ai' },
    ],

    footer: {
      message: 'MIT License',
      copyright: 'Copyright 2026 MoriitoDev',
    },
  },
});
