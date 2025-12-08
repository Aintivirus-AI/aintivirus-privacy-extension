const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isFirefox = env?.target === 'firefox';
  const isProduction = argv.mode === 'production';

  return {
    entry: {
      background: './src/background/index.ts',
      content: './src/content/index.ts',
      popup: './src/popup/index.tsx',
      settings: './src/settings/index.tsx',
      // Fingerprint protection script - injected into MAIN world
      fingerprintInjected: './src/fingerprinting/injectedScript.ts',
      // Security monitoring script - injected into MAIN world for wallet interception
      securityInjected: './src/security/injected.ts',
      // dApp provider script - injected into MAIN world for EIP-1193/Solana providers
      dappInpage: './src/dapp/providers/inpage.ts',
      // dApp approval window
      approval: './src/approval/index.tsx',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: [/node_modules/, /\.test\.ts$/, /\.test\.tsx$/],
        },
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, 'css-loader'],
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      alias: {
        '@shared': path.resolve(__dirname, 'src/shared'),
        '@wallet': path.resolve(__dirname, 'src/wallet'),
      },
      fallback: {
        // Node.js polyfills for Solana/crypto libraries
        stream: require.resolve('stream-browserify'),
        buffer: require.resolve('buffer/'),
      },
    },
    plugins: [
      // Extract CSS to separate files (required for Chrome extension CSP)
      new MiniCssExtractPlugin({
        filename: '[name].css',
      }),
      // Provide Node.js globals for browser compatibility
      new webpack.ProvidePlugin({
        process: 'process/browser',
        Buffer: ['buffer', 'Buffer'],
      }),
      // Define environment variables for conditional logging
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
      }),
      new HtmlWebpackPlugin({
        template: './src/popup/popup.html',
        filename: 'popup.html',
        chunks: ['popup'],
        inject: 'body',
        scriptLoading: 'blocking',
      }),
      new HtmlWebpackPlugin({
        template: './src/settings/settings.html',
        filename: 'settings.html',
        chunks: ['settings'],
        inject: 'body',
        scriptLoading: 'blocking',
      }),
      new HtmlWebpackPlugin({
        template: './src/approval/approval.html',
        filename: 'approval.html',
        chunks: ['approval'],
        inject: 'body',
        scriptLoading: 'blocking',
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: isFirefox ? 'manifest.firefox.json' : 'manifest.json',
            to: 'manifest.json',
          },
          {
            from: 'public',
            to: '.',
          },
          {
            from: 'rules',
            to: 'rules',
          },
        ],
      }),
    ],
    devtool: isProduction ? false : 'cheap-module-source-map',
    optimization: {
      minimize: isProduction,
      minimizer: isProduction ? [
        new TerserPlugin({
          terserOptions: {
            compress: {
              // SECURITY: Remove console.log/warn in production to prevent fingerprinting
              // Keep console.error for critical errors
              drop_console: false,
              pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
            },
            mangle: true,
            format: {
              comments: false,
            },
          },
          extractComments: false,
        }),
      ] : [],
    },
  };
};

