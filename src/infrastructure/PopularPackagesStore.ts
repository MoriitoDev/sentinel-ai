import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import type { IPopularPackagesStore } from '../domain/repositories';
import type { INpmClient } from '../domain/repositories';

interface CacheData {
    lastUpdated: string;
    source: string;
    packages: string[];
}

const CACHE_DIR = '.sentinel';
const CACHE_FILE = 'popular-packages.json';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Fallback list of popular packages when API is unavailable
const FALLBACK_POPULAR_PACKAGES: string[] = [
    // Frameworks & Libraries
    'react', 'react-dom', 'vue', 'angular', 'svelte', 'next', 'nuxt',
    'express', 'fastify', 'koa', 'nest', 'hapi', 'fastify',
    
    // Build Tools
    'webpack', 'rollup', 'esbuild', 'vite', 'parcel', 'turbo',
    'typescript', 'ts-node', 'tsx', '@babel/core', 'babel-loader',
    
    // Testing
    'jest', 'vitest', 'mocha', 'jasmine', 'cypress', 'playwright', '@testing-library/react',
    
    // Utilities
    'lodash', 'underscore', 'ramda', 'axios', 'node-fetch', 'cross-fetch',
    'moment', 'dayjs', 'date-fns', 'uuid', 'nanoid', 'shortid',
    'commander', 'inquirer', 'chalk', 'ora', 'figlet',
    
    // File System & Glob
    'glob', 'fast-glob', 'fs-extra', 'rimraf', 'globby',
    
    // Security
    'jsonwebtoken', 'bcrypt', 'passport', 'helmet', 'cors', 'express-rate-limit',
    'dotenv', 'bcryptjs',
    
    // Validation & Parsing
    'joi', 'yup', 'zod', 'class-validator', 'ajv', 'yaml', 'toml',
    
    // Database
    'mongoose', 'sequelize', 'prisma', 'typeorm', 'pg', 'mysql2', 'redis', 'mongodb',
    
    // Logging
    'winston', 'pino', 'log4js', 'bunyan',
    
    // HTTP & WebSocket
    'socket.io', 'ws', 'graphql', 'apollo-server', 'apollo-client',
    
    // State Management
    'redux', 'zustand', 'mobx', 'recoil', 'jotai',
    
    // CSS & Styling
    'styled-components', 'emotion', 'tailwindcss', 'sass', 'less',
    
    // CLI & Dev Tools
    'nodemon', 'pm2', 'concurrently', 'cross-env', 'husky', 'lint-staged',
    'eslint', 'prettier', '@eslint/js', 'eslint-config-prettier',
    
    // Popular @types
    '@types/node', '@types/react', '@types/react-dom', '@types/express', 
    '@types/jest', '@types/lodash', '@types/uuid', '@types/bcrypt',
    
    // Popular scoped
    '@angular/core', '@angular/common', '@angular/cli',
    '@nestjs/core', '@nestjs/common', '@nestjs/cli',
    '@vue/cli', '@vue/compiler-sfc',
    '@tanstack/react-query', '@tanstack/vue-query',
    '@trpc/client', '@trpc/server', '@trpc/react-query',
    
    // UI Libraries
    '@mui/material', '@emotion/react', '@emotion/styled',
    '@radix-ui/react-primitive', '@radix-ui/react-dialog',
    'antd', 'chakra-ui', '@chakra-ui/react',
    
    // Other popular
    'react-router-dom', 'react-query', 'swr', 
    'zod', 'react-hook-form', 'formik',
    'framer-motion', 'gsap', 'three',
];


export class PopularPackagesStore implements IPopularPackagesStore {
    private cachePath: string;
    private npmClient: INpmClient;

    constructor(npmClient: INpmClient, cwd: string = process.cwd()) {
        this.npmClient = npmClient;
        this.cachePath = join(cwd, CACHE_DIR, CACHE_FILE);
        this.ensureCacheDir(cwd);
    }

    private ensureCacheDir(cwd: string): void {
        const dir = join(cwd, CACHE_DIR);
        if (!existsSync(dir)) {
            try {
                mkdirSync(dir, { recursive: true });
            } catch {
                // If we can't create the directory, we'll work without cache
            }
        }
    }

    async getPopularPackages(forceRefresh: boolean = false): Promise<string[]> {
        // If force refresh or cache doesn't exist/invalid, fetch from API
        if (forceRefresh || !this.isCacheValid()) {
            return this.fetchAndCache();
        }

        // Try to load from cache
        try {
            const data = this.loadFromCache();
            if (data && data.packages && data.packages.length > 0) {
                return data.packages;
            }
        } catch {
            // Cache is corrupted, fetch fresh data
        }

        return this.fetchAndCache();
    }

    isCacheValid(): boolean {
        try {
            if (!existsSync(this.cachePath)) {
                return false;
            }
            const stats = statSync(this.cachePath);
            const age = Date.now() - stats.mtime.getTime();
            return age < CACHE_DURATION_MS;
        } catch {
            return false;
        }
    }

    private loadFromCache(): CacheData | null {
        try {
            const content = readFileSync(this.cachePath, 'utf-8');
            return JSON.parse(content) as CacheData;
        } catch {
            return null;
        }
    }

    private async fetchAndCache(): Promise<string[]> {
        console.log('Fetching popular packages from npms.io...');
        
        let packages = await this.npmClient.fetchPopularPackages(500);
        
        // Use fallback if API fails or returns empty
        if (packages.length === 0) {
            console.log('Using fallback list of popular packages...');
            packages = [...FALLBACK_POPULAR_PACKAGES];
        }

        // Save to cache
        const cacheData: CacheData = {
            lastUpdated: new Date().toISOString(),
            source: packages === FALLBACK_POPULAR_PACKAGES ? 'fallback' : 'npms.io',
            packages,
        };

        try {
            writeFileSync(this.cachePath, JSON.stringify(cacheData, null, 2), 'utf-8');
            console.log(`Cached ${packages.length} popular packages`);
        } catch (err) {
            console.warn(`Warning: Could not save cache: ${err}`);
        }

        return packages;
    }

    async clearCache(): Promise<void> {
        try {
            if (existsSync(this.cachePath)) {
                const { unlinkSync } = await import('node:fs');
                unlinkSync(this.cachePath);
            }
        } catch {
            // Ignore errors
        }
    }
}
