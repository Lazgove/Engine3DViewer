import path from 'path';

export default {
  entry: './src/index.js',  // Entry point for your app
  output: {
    filename: 'bundle.js',  // Output bundle file name
    path: path.resolve(process.cwd(), 'dist'),  // Fixing the output path to the correct location
  },
  mode: 'development',  // Set mode to 'development' for easier debugging, or 'production' for optimized builds
  devtool: 'source-map',  // Optional: helps with debugging by generating a source map
  module: {
    rules: [
      {
        test: /\.m?js$/,  // Process .js and .mjs files
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',  // Use Babel for JS transpiling
          options: {
            presets: ['@babel/preset-env'],  // Use Babel presets to compile JavaScript for various browsers
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.js'],  // Allows imports without file extensions
  },
  watch: true,  // Enable webpack watch mode for automatic rebuilding on changes
};
