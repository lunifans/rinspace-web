declare module 'react-easy-crop' {
  import * as React from 'react';

  export type Point = {
    x: number;
    y: number;
  };

  export type Area = {
    width: number;
    height: number;
    x: number;
    y: number;
  };

  export type CropperProps = {
    image?: string;
    crop: Point;
    zoom?: number;
    aspect?: number;
    cropShape?: 'rect' | 'round';
    showGrid?: boolean;
    onCropChange: (location: Point) => void;
    onZoomChange?: (zoom: number) => void;
    onCropComplete?: (croppedArea: Area, croppedAreaPixels: Area) => void;
  };

  const Cropper: React.ComponentType<CropperProps>;

  export default Cropper;
}
