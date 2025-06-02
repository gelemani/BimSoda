'use client';

import React, {useState, FocusEvent, useEffect} from 'react';
import { useRouter } from 'next/navigation';
import {apiService} from '@/app/services/api.service';

interface HeaderProps {
    centralString?: string;
    // Добавить сюда при необходимости другие поля
}

const Header: React.FC<HeaderProps> = ({ centralString}) => {
    const router = useRouter();
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [userName, setUserName] = useState<string>("");
    const [userSurname, setUserSurname] = useState<string>("");
    const[companyName, setCompanyName] = useState<string>("");
    const[companyPosition, setCompanyPosition] = useState<string>("");


    useEffect(() => {
        if (typeof window !== "undefined") {
            const userName = localStorage.getItem("userName") || "";
            const userSunName = localStorage.getItem("userSurname") || "";
            const companyName = localStorage.getItem("companyName") || "";
            const companyPosition = localStorage.getItem("companyPosition") || "";
            setUserName(userName);
            setUserSurname(userSunName);
            setCompanyName(companyName);
            setCompanyPosition(companyPosition)
        }
    }, []);

    const handleBlur = (e: FocusEvent<HTMLDivElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setUserMenuOpen(false);
        }
    };

    console.log("Header centralString:", centralString);
    return (
        <div
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100%",
                height: 50,
                backgroundColor: "#242B35",
                display: "flex",
                alignItems: "center",
                padding: "0 20px",
                boxSizing: "border-box",
                color: "white",
                fontWeight: "bold",
                fontSize: "1.5em",
                zIndex: 1000,
                boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
            }}
        >
            <button
                style={{
                    background: "none",
                    border: "none",
                    color: "white",
                    fontSize: "1em",
                    fontWeight: "bold",
                    cursor: "pointer",
                    padding: 0
                }}
                onClick={() => router.push(`/projects?companyName=${encodeURIComponent(companyName ?? "")}`)}
                title="На главную"
            >
                SodaBIM
            </button>

            <div
                style={{
                    position: "absolute",
                    left: "50%",
                    transform: "translateX(-50%)",
                    fontWeight: "normal",
                    pointerEvents: "none",
                    userSelect: "none",
                }}
            >
                {centralString}
            </div>

            <div style={{ flex: "0 0 auto", marginLeft: "auto" }}>
                <div
                    style={{ position: 'relative', cursor: 'pointer' }}
                    onClick={() => setUserMenuOpen(prev => !prev)}
                    onBlur={handleBlur}
                    tabIndex={0}
                    title="Пользователь"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="white"
                        viewBox="0 0 24 24"
                        width="28"
                        height="28"
                        style={{ display: 'block' }}
                    >
                        <path
                            d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"
                        />
                    </svg>

                    {userMenuOpen && (
                        <div
                            style={{
                                position: 'absolute',
                                top: 36,
                                right: 0,
                                backgroundColor: '#242B35',
                                color: 'white',
                                boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
                                borderRadius: 8,
                                padding: 6,
                                width: 150,
                                zIndex: 2000,
                                fontSize: '0.8rem',
                            }}
                        >
                            <p style={{ marginBottom: 4 }}><b>Имя:</b> {userName || "Неизвестно"}</p>
                            <p style={{ marginBottom: 4 }}><b>Фамилия:</b> {userSurname || "Неизвестно"}</p>
                            <p style={{ marginBottom: 4 }}><b>Компания:</b> {companyName || "Неизвестно"}</p>
                            <p style={{ marginBottom: 4 }}><b>Должность:</b> {companyPosition || "Неизвестно"}</p>
                            <button
                                onClick={() => {
                                    apiService.logout();
                                    router.push('/');
                                }}
                                style={{
                                    marginTop: 6,
                                    width: '100%',
                                    backgroundColor: '#c53030',
                                    color: 'white',
                                    border: 'none',
                                    padding: '4px 0',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    fontSize: '0.8rem',
                                }}
                            >
                                Выйти
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Header;