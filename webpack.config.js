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
      fingerprintInjected: './src/fingerprinting/injectedScript.ts',
      securityInjected: './src/security/injected.ts',
      dappInpage: './src/dapp/providers/inpage.ts',
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
        stream: require.resolve('stream-browserify'),
        buffer: require.resolve('buffer/'),
      },
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: '[name].css',
      }),
      new webpack.ProvidePlugin({
        process: 'process/browser',
        Buffer: ['buffer', 'Buffer'],
      }),
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
            from: 'vendor/aintivirusAdblocker/rulesets',
            to: 'aintivirusAdblocker/rulesets',
          },
          {
            from: 'vendor/aintivirusAdblocker/web_accessible_resources',
            to: 'aintivirusAdblocker/web_accessible_resources',
          },
          {
            from: 'vendor/aintivirusAdblocker/js/scripting',
            to: 'aintivirusAdblocker/js/scripting',
          },
          {
            from: 'vendor/aintivirusAdblocker/LICENSE.txt',
            to: 'aintivirusAdblocker/LICENSE.txt',
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
              drop_console: false,
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
