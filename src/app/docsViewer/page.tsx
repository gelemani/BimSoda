'use client';

import React, { JSX, useEffect, useState } from 'react';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import header from "@/app/components/header";
import Header from "@/app/components/header";

export default function DocsViewerPage() {
    const [content, setContent] = useState<JSX.Element | null>(null);
    const [companyName, setCompanyName] = useState<string>("");

    const [name, setName] = useState<string>('');

    useEffect(() => {
        if (typeof window !== "undefined") {
            const storedCompanyName = localStorage.getItem("companyName") || "";
            setCompanyName(storedCompanyName);
        }
    }, []);

    useEffect(() => {
        const fileUrl = sessionStorage.getItem('viewerFileUrl');
        const name = (sessionStorage.getItem('viewerFileName') as string) ?? '';
        setName(name);
        const type = sessionStorage.getItem('viewerFileType') || '';

        if (!fileUrl) {
            setContent(<div>Файл не найден</div>);
            return;
        }

        fetch(fileUrl)
            .then(res => res.arrayBuffer())
            .then(arrayBuffer => {
                const extension = name.split('.').pop()?.toLowerCase();

                if (extension === 'docx') {
                    mammoth.convertToHtml({ arrayBuffer }).then(result => {
                        setContent(<div dangerouslySetInnerHTML={{ __html: result.value }} />);
                    });
                } else if (extension === 'xlsx') {
                    const data = new Uint8Array(arrayBuffer);
                    const workbook = XLSX.read(
                        data, { type: 'array' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                    const table = (
                        <table cellPadding="6" style={{ borderCollapse: 'collapse', width: '100%' }}>
                            <tbody>
                                {rows.map((row, rowIndex) => (
                                    <tr key={rowIndex}>
                                        {row.map((cell, cellIndex) => (
                                            <td key={cellIndex}>{cell}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    );

                    setContent(table);
                } else if (extension === 'pptx') {
                    setContent(
                        <div style={{ padding: 20, textAlign: 'center' }}>
                            Просмотр PPTX не поддерживается напрямую. Пожалуйста, скачайте файл и откройте его в PowerPoint или другом просмотрщике.
                            <br />
                            <a href={fileUrl} download={name} style={{ marginTop: 10, display: 'inline-block' }}>Скачать PPTX</a>
                        </div>
                    );
                } else if (extension === 'png' || extension === 'jpg' || extension === 'jpeg') {
                    setContent(
                        <div style={{ textAlign: 'center' }}>
                            <img src={fileUrl} alt={name} style={{ maxWidth: '100%', maxHeight: '80vh' }} />
                        </div>
                    );
                } else {
                    setContent(<div>Неподдерживаемый формат файла</div>);
                }
            })
            .catch(err => {
                console.error('Ошибка загрузки файла:', err);
                setContent(<div>Не удалось загрузить файл</div>);
            });

        return () => {
            URL.revokeObjectURL(fileUrl);
        };
    }, []);

    return (
        <>
        <Header centralString={companyName}/>
        <div style={{ marginTop: "44px", padding: 20 }}>
            <h2 style={{ fontSize: '2rem', textAlign: 'center' }}>{name}</h2>
            <h1></h1>
            {content}
        </div>
    </>
    );
}