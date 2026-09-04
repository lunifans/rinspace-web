import React from 'react';
import ReactDOM from 'react-dom/client';

import '../styles/index.css';
import './north-star.css';
import { NorthStarApp } from './NorthStarApp';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode><NorthStarApp /></React.StrictMode>,
);
