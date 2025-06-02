'use client';

import { useRouter } from 'next/navigation';

const useFileViewer = () => {
    useRouter();

    const openFileInViewer = ({ file, url }: { file: File; url: string }) => {
        console.log('Opening file in viewer:', { name: file.name, type: file.type, url });
        const ext = file.name.split('.').pop()?.toLowerCase();
        const target = ['ifc'].includes(ext || '') ? 'viewer' : 'docsViewer';

        // Сохраняем в sessionStorage сначала
        sessionStorage.setItem('viewerFileUrl', url);
        sessionStorage.setItem('viewerFileName', file.name);
        sessionStorage.setItem('viewerFileType', file.type);

        // Потом открываем окно
        const viewerWindow = window.open(`/${target}`, '_blank');
        if (!viewerWindow) {
            alert("Браузер заблокировал всплывающее окно. Разрешите его вручную.");
        }
    };

    return { openFileInViewer };
};

export default useFileViewer;