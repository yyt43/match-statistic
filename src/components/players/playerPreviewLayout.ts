export function getPreviewLayout(groupCount: number): {
  containerClass: string;
  gridClass: string;
} {
  if (groupCount <= 1) {
    return {
      containerClass: 'max-w-3xl',
      gridClass: 'grid-cols-1',
    };
  }
  if (groupCount === 2 || groupCount === 4) {
    return {
      containerClass: 'max-w-5xl',
      gridClass: 'grid-cols-1 md:grid-cols-2',
    };
  }
  if (groupCount <= 6) {
    return {
      containerClass: 'max-w-6xl',
      gridClass: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3',
    };
  }
  return {
    containerClass: 'max-w-7xl',
    gridClass: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4',
  };
}
