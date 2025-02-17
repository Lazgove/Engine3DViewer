import path from 'path';

export default {
  entry: './src/index.js',  // ✅ Webpack starts here
  output: {
    filename: 'bundle.js',
    path: path.resolve(process.cwd(), 'dist'),
  },
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.m?js$/,  // ✅ Allows .js and .mjs files
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.js'], // ✅ Allows imports without file extensions
  },
};
