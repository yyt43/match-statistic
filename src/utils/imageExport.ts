import html2canvas from 'html2canvas';

export async function generateImage(elementId: string, fileName: string): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found`);
  }

  // 保存当前滚动位置
  const originalScrollY = window.scrollY;
  const originalScrollX = window.scrollX;

  // 滚动到顶部，避免 html2canvas 截图偏移
  window.scrollTo(0, 0);

  try {
    const canvas = await html2canvas(element, {
      backgroundColor: '#1e293b',
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight,
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      width: element.offsetWidth,
      height: element.offsetHeight,
      onclone: (clonedDoc) => {
        // 解除目标元素所有祖先的 overflow/高度限制，避免截取位于滚动容器内的长内容时被裁切
        const clonedElement = clonedDoc.getElementById(elementId);
        if (clonedElement) {
          let parent = clonedElement.parentElement;
          while (parent && parent !== clonedDoc.body) {
            const style = clonedDoc.defaultView?.getComputedStyle(parent) || parent.style;
            if (style.overflow === 'auto' || style.overflow === 'hidden' || style.overflowY === 'auto' || style.overflowY === 'hidden') {
              parent.style.overflow = 'visible';
              parent.style.overflowY = 'visible';
            }
            if (style.maxHeight && style.maxHeight !== 'none') {
              parent.style.maxHeight = 'none';
            }
            if (style.height && (style.height.includes('px') || style.height.includes('vh') || style.height.includes('calc'))) {
              parent.style.height = 'auto';
            }
            parent = parent.parentElement;
          }
        }
      },
    });

    const link = document.createElement('a');
    link.download = `${fileName}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } finally {
    // 恢复滚动位置
    window.scrollTo(originalScrollX, originalScrollY);
  }
}
