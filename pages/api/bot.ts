import { Message } from '@/types/vocechat';
import { OPENAI_API_HOST, OPENAI_ORGANIZATION, VOCECHAT_BOT_SECRET, VOCECHAT_BOT_UID, VOCECHAT_ORIGIN } from '@/utils/app/const';
export const config = {
    runtime: 'edge',
};

const sendMessageToBot = async (url: string, message: string) => {
    // 通过bot给vocechat发消息
    try {
        let resp = await fetch(url, {
            method: "POST",
            headers: {
                "content-type": "text/markdown",
                "x-api-key": VOCECHAT_BOT_SECRET,
            },
            body: message,
        });
        resp = await resp.json();
        console.log("bot: send successfully", resp);
    } catch (error) {
        console.error("bot: send failed", url, error);
    }
}

const handler = async (req: Request): Promise<Response> => {
    console.log("bot: from webhook push", req.method, VOCECHAT_BOT_UID, VOCECHAT_ORIGIN, VOCECHAT_BOT_SECRET.slice(-5));
    if (!req.url.startsWith(VOCECHAT_ORIGIN)) {
        return new Response(`bot: invalided source`, { status: 403 });
    }
    let _url = `${VOCECHAT_ORIGIN}/api/bot/`;
    try {
        switch (req.method) {
            case "GET":
                return new Response(`${req.method}: bot resp`, { status: 200 });
            // break;
            case "POST": {
                const data = await req.json() as Message;
                console.log("bot.ts handler POST", data);
                const mentions = (data.detail.properties ?? {}).mentions ?? [];
                // 机器人本人发的消息不处理
                if (data.from_uid == VOCECHAT_BOT_UID) {
                    console.log("bot: ignore sent by bot self");
                    return new Response(`ignore sent by bot self`, { status: 200 });
                }
                // 群里没at 此bot的消息不处理
                if ('gid' in data.target) {
                    const mentionedAtGroup = mentions.some(m => m == VOCECHAT_BOT_UID);
                    if (!mentionedAtGroup) {
                        console.log("bot: ignore not mention at group");
                        return new Response(`ignore not mention at group`, { status: 200 });
                    }
                }

                if ('gid' in data.target) {
                    _url += `send_to_group/${data.target.gid}`;

                } else {
                    _url += `send_to_user/${data.from_uid}`;
                }
                console.log("bot: start req ChatGPT");
                let inter = setTimeout(() => {
                    sendMessageToBot(_url, "**正在为您生成回答，请耐心等待...**");
                }, 5000);
                fetch(`${OPENAI_API_HOST}/v1/chat/completions`, {
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                        'OpenAI-Organization': OPENAI_ORGANIZATION,

                    },
                    method: 'POST',
                    body: JSON.stringify({
                        model: "gpt-3.5-turbo",
                        messages: [
                            {
                                role: 'system',
                                content: "You are ChatGPT, a large language model trained by OpenAI. Follow the user's instructions carefully. Respond using markdown.",
                            },
                            {
                                role: 'user',
                                // 去掉 @xxx
                                content: data.detail.content.replace(/@[0-9]+/g, "").trim(),
                            },
                        ],
                        max_tokens: 1000,
                        temperature: 1,
                        stream: false,
                    }),
                }).then(resp => {
                    clearTimeout(inter)
                    resp.json().then(data => {
                        const [{ message: { content } }] = data.choices;
                        // 通过bot给vocechat发消息
                        sendMessageToBot(_url, content);
                    });
                }).catch(err => {
                    clearTimeout(inter)
                    console.error("bot: error", err);
                    // 通过bot给vocechat发消息
                    sendMessageToBot(_url, "**Something Error!**");
                    return new Response(`Error`, { status: 200 });
                });
                return new Response(`OK`, { status: 200 });
            }
            // break;

            default:
                console.log("bot: handler default", req.method);
                return new Response(`${req.method}: bot resp`, { status: 200 });
            // break;
        }
    } catch (error) {
        console.error("bot: error", error);
        // 通过bot给vocechat发消息
        sendMessageToBot(_url, "**Something Error!**");
        return new Response(`Error`, { status: 200 });
    }

};

export default handler;