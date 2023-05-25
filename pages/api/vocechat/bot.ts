
export const config = {
    runtime: 'edge',
};

const handler = async (req: Request): Promise<Response> => {

    return new Response("bot resp", { status: 200 });

};

export default handler;