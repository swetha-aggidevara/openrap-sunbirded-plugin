
import Response from './../utils/response';

export default class Tenant {
    get(req, res) {
        let resObj = {
            "appLogo": "/appLogo.png",
            "favicon": "/favicon.ico",
            "logo": "/logo.png",
            "titleName": process.env.app_title
        }
        res.send(Response.success('api.tenant.info', resObj))
    }
}