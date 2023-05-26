import { Message } from '@/types/vocechat';
import { OPENAI_API_HOST, OPENAI_ORGANIZATION, VOCECHAT_BOT_SECRET, VOCECHAT_BOT_UID, VOCECHAT_ORIGIN } from '@/utils/app/const';
export const config = {
    runtime: 'edge',
};

const sendMessageToBot = async (url: string, message: string) => {
    // 通过bot给vocechat发消息
    fetch(url, {
        method: "POST",
        headers: {
            "content-type": "text/markdown",
            "x-api-key": VOCECHAT_BOT_SECRET,
        },
        body: message,
    }).then((resp) => {
        console.log("发送成功，消息ID：", resp.body);
    }).catch((err) => {
        console.error("发送失败：", err, url, VOCECHAT_BOT_SECRET);
    });
}

const handler = async (req: Request): Promise<Response> => {
    console.log("bot: from webhook push", req.method, VOCECHAT_BOT_UID, VOCECHAT_ORIGIN, VOCECHAT_BOT_SECRET.slice(-5));
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
                const res = await fetch(`${OPENAI_API_HOST}/v1/chat/completions`, {
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
                                content: data.detail.content,
                            },
                        ],
                        max_tokens: 1000,
                        temperature: 1,
                        stream: false,
                    }),
                });
                const gptRespData = await res.json();
                const [{ message: { content } }] = gptRespData.choices;
                console.log("bot: gpt resp", content);
                // 通过bot给vocechat发消息
                sendMessageToBot(_url, content);
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