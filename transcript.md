\# Original Transcript

\[View Full Transcript in Google Docs\](https://docs.google.com/document/d/1YwzVYCQXNFxlIQB5cuBlbHykOYDE7-Cg3xrM\_p70fFM/edit)

Meeting Title: Alonzo Ford and Jon Matzner  
Date: Mar 10  
Meeting participants: Erin, Erin, Alonzo Ford, Adrilexo28, Jovan Ford14

Transcript:  
   
Them: Alonzo. The CEO, Lowe's guardian angel. Erin is our chief people officer, and Adrian is my executive assistant. And he will probably be the one if there's an implementation, managing the implementation of this, along with our IT associate. And then, of course, Erin, an executive leader who's touching people in process.    
Me: Perfect. Cool. Yeah. Of course. Love it. Love it. So tell me just quickly. I know a little bit about the company, but give me the quick kind of like, give me a sense of however you guys beds or headcount or just give me some sense of scale or scope or history or whatever.    
Them: And technology. Yeah, yeah, yeah. We're a middle market. Assisted living company.    
Me: Okay?    
Them: Group home or care company taking care of people, primarily in Georgia. And we have a little over 100 employees and contractors.    
Me: Fantastic.    
Them: We take care of a little fewer than that amount in number.    
Me: Okay? Fantastic. Okay. And you guys own the homes? Basically.    
Them: An affiliate owns the homes.    
Me: Perfect. Okay. So what's. Nice to meet everybody. I'm Jon. I'm one of the co founders at Sagan. I'll give it to you in, like, five seconds. Just kind of like what we're doing, what this is, and then we'll just kind of go. So the goal out of. This call is to identify one bite sized problem. That is, we can kind of build quickly, add value quickly, get to know you guys a little bit, kind of build some momentum, doing it affordably, quickly. We have done things like replace ERPs before, but that isn't this first bite of the apple, right? We want to build, like, a little momentum first. Right? Inexpensive, quick, that kind of stuff. The reason Sagan ultimately, is Costco is what we're trying to be, which is we want to make our money on our membership dues. And then everything we do after or around that is free or very low cost. And this is no exception. So you guys are Costco members, which means you get to buy the big thing of toilet paper at 75% less than if you go to Safeway or whatever. Right. And so similarly here, what we try to come up with, which is we're doing a ton of hiring, we do a ton of professional development. And I am not, as a small business owner, not going to build AI agents. If I have to pay some guy, I don't know, $15,000 a month for three months just to get started, I'm just not going to do it. And so what we wanted to do was take advantage of our membership based business model to build very, very low cost AI agents for our members. We're just seeing we're in a very good position to do it because we know you guys really well. We also have an incredible team because of our ability to recruit from around the world that is really good at building this stuff, and we've built some really clever stuff that simple. It's a great compliment to global talent. And so that's kind of like why we're doing this and how we're doing this. The last thing I'll say up front before we start working to identify that problem. Is. I want to tell you how we make our money. Because it's important, because we wanted to do it as kind of, like, economic as possible. So the way we do it is you can either burn one of your Sagan credits, which you get 6 per year if you're a mainstream member, or you can pay us 500 bucks. That's only after we present you something after this call, and you're like, yes, please build that. So either 500 bucks or one credit, and that's 10 development hours. From our team. We don't really build anything that's going to take us more than 10 hours at this stage. Later we will, but that's only if we want to. And then it's usually from an ongoing cost basis, a bunch of API keys, things like that, like tokens from AI models. I don't know how familiar you guys are with that stuff. And what we do is we take whatever the API costs are and we add 20%. So it's 70\. Literally, it's $43, and we take six bucks a month on top of the 43\. It is designed to be very, very, very low cost. There's no contracts, there's no commitment. There's no seats. You can cancel at any point. The idea is for 500\. Bucks, you can start trying to play with this stuff, and if it works, we'll build a ton more for you. And if it doesn't work, the next day, you can say, shut this thing off and it's done. Right? This is not. You got to commit to a year. This is not. You got to. Pay me 20 grand just to give you an initial prototype. So the idea is that so many of our members need to be building a ton of AI, but when you have to charge that much money, you're just not going to do it. And so that's the idea of this. So do you have any questions? On that stuff, Alonzo.    
Them: No. I like our efficiency. And we're ready to jump in. I'll just tell you, we're not even close to using up our six Sagan seats.    
Me: Perfect. Perfect. So now it doesn't cost anything. We'll just burn one of those and off you go.    
Them: Every year. So the agent. Would.    
Me: Right. And we don't use all 10 hours on this. We'll roll them into the next build you guys want. So if this only takes us three hours, you have seven hours left. So if you want to build the next thing, we still don't need to charge anything, so, yeah, it's awesome that's. Exactly what I wanted, Alonzo, was you guys to get a ton of value out of your membership. So that's why we started doing it. So tell me, Alonzo. There's a couple different or whoever wants to weigh in. Is there a particular problem that's bugging you? Is there a particular constraint that you've really tried that you think some technology might apply to? When I say kind of like, fix what bugs you. Is it Accounts receivable? Is it content creation? Is it scheduling? Is it billing? Right. There's a lot of different options we could work in. Is there one problem that jumps out to you that you think is worth it? Us jumping into.    
Them: Yeah. And. And I've. I've taken some AI automation classes.    
Me: Oh, cool. Okay.    
Them: And so I've thought about this. I don't have the answer, like the full baked answer.    
Me: Sure.    
Them: But I. I realized that what we would get an agent for is something that is very manual and very, you know, high touch and very repetitive.    
Me: Yep. Yep.    
Them: That we would do. And. And I think that I did something. I launched an initiative probably six months ago. For everybody to use Clockify to track what they were using their time on. And I think for some reason we got no ROI out of that. We got some, a little bit of data, but nothing happened with that. And Adrian, I would love to get your, your help in figuring out how we can leverage that data to do something with it.    
Me: Okay? Okay? You can definitely send that to us. If you want, we can take a look at it.    
Them: And then.    
Me: The other thing. Alonzo, if it would help you to. Alonzo. I'm also happy to tell you some of the agents, we're building for other members to maybe get the juices flowing, but go in whatever direction you want.    
Them: Yeah. Yeah, I think that would be helpful.    
Me: Okay?    
Them: Because I have. I have probably two or three things in mind. But yeah, let's, let's hear what are the, like, the top, you know, top five to seven things that you have seen work with some of your other clients.    
Me: Sure. Yep. The. The biggest question that is going to shape everything, and it's even what examples I give is, do you got. Would you guys say that you have more of a sales challenge or more of a fulfillment challenge? Because usually in a company, there's either an external constraint or an internal constraint. Like, meaning if I gave you 100 sales, would you guys break? Or you guys have plenty of leads, but just administering billing, moving them through your ecosystem and turning it into free cash flow. You have constraints because you only have so many staff accountants or, you know, whatever it is.    
Them: Yeah. I'm going to have to say our constraints are internal.    
Me: Where would you say your constraint is? Okay?    
Them: And I'm going to rank them and say one is quality assurance or compliance.    
Me: Okay?    
Them: We have daily progress notes. That our managers are supposed to check. And then our vice president or our, you know, compliance leader are supposed to check behind the managers. And, and, and that's something that I think we could save a lot of time. We also have things that nurses should be able to write or check every day.    
Me: Sure.    
Them: And we need the agent to identify red flags when either there was not a note. Or something was out of tolerance.    
Me: Okay?    
Them: So that's our number one.    
Me: So wait, let's pause right there. I mean, if that's ranked 1, that's a wonderful problem. I've built tools around that before. Like. Like. I'll give you an example. We built something for home service company where every single one of their inbound phone calls we transcribed, we graded against the script. We graded the lead, and then if any call center person had multiple calls with the same pattern, it sent an email to the head of their call center saying, adrian forgets to build rapport. You should help coach him on building more rapport. And this was from hundreds of calls a day. And because that call center manager wasn't listening to hundreds of calls a day. They didn't have the time. But the AI agent was reading the transcripts and being like, Adrian is really good at closing, but he sometimes forgets to set up a follow up meeting. And so it gives visibility into a huge amount of data without your manager having to listen to every call. So.    
Them: Well, I mean, you. You're actually kind of hitting close to home because there's also. I get probably hundreds of emails a day. And, I mean, Adrian does his best to manage it. But maybe AI can help us identify the things that need my attention.    
Me: Yeah.    
Them: Or that, you know, Adrian could actually put attention on versus.    
Me: I mean, if Adrian. If Adrian wasn't just sitting on a beach all day, I'd say maybe he could help. But, you know, given his background, I assume he's just, you know, drinking a pina colada right now, so. No, I'm just kidding.    
Them: It's just out of the screen. It's just to the left of the screen.    
Me: It's just off camera. Adrian, where are you based?    
Them: I'm in Venezuela right now.    
Me: Awesome.    
Them: I used to live in Medellin.    
Me: Oh, cool. Are you Colombian or Venezuelan?    
Them: And venezuelan.    
Me: Oh, cool. Yeah, we have Jesus is. He's a Venezuelan living in Argentina right now. We love him, so. Lot. Lots going on in those next loads. Well.    
Them: Yeah. All right.    
Me: Okay, so. I mean, what I'd say. Alonzo. Would you? So those are actually two different agents? I would say. Do you want to do an email one? Or do you want to do a compliance notes 1 as the first byte of the apple, so to speak?    
Them: What? What? I mean, Erin has her hand up because we've got some. Some HR related high touch things as well.    
Me: That would be a third, but that would be a third. Right now. I just want to pick one or else we'll build. We'll build multiple for you over time.    
Them: Well, I still wanted to hear, like, what, What? Like, what's on the shelf that, you know, you've seen work for other clients. And then also, Erin has her hand up. So let's. Let's hear from Erin.    
Me: Sure. Okay? Erin? Do you want me to go first, Erin? You go first. How about you go first, Erin? Yeah.    
Them: Thank you so much. Hey, Jon. Thank you for your time.    
Me: Hey.    
Them: What I was going to say, actually, is that I would prefer this. Get Alonzo squared away first.    
Me: Cool.    
Them: Honestly, because I need him to be even more focused and present. And I know we share this. We hate email.    
Me: Okay? Sure.    
Them: And I, like, loathe it. And I know that that would free him up in his mind, in his time.    
Me: Okay? Okay? Okay?    
Them: Then we can kind of scale down after that.    
Me: So, yeah, let me give you.    
Them: What? Email or. And. And calendar. Because sometimes calendar. I consider email and calendar two sides of the same, you know, EA coin.    
Me: Sure.    
Them: That. That we can truly, if we can have an agent, really simplify that.    
Me: Okay? Sure. Okay?    
Them: Could be more efficient for me and then help free up Adrian to focus on higher order activity.    
Me: Yeah. Yeah. So let me give you just a couple, which may or may not be applicable, but just to get the juices flowing right, we just built for a bookkeeping firm. He used to send loom videos to each of his clients every month when he closed their books. But he has too many customers now, and he can't do it. And his customers were churning. So we built a tool. We cloned his voice. And with AI, we create a video. They upload the three financial statements at the end of the month, and then his voice is cloned, and they sent. We send a video to his clients that is in Alonzo voice saying, hey, your gross margins went down this month. And it's all automated. Every single month. We send automated reports that are customized to that customer every single month. And it helps him retain his customers, because now they feel as if they're getting a personalized note that instead of just sending three statements, They get a customized video walking through their statements from the CEO of their bookkeeping firm. So we just built that. We built one for a flower company that serves cruise ships, where he has multiple hundreds of SKUs, and they work out of 30 or 40 global ports with different currencies, different suppliers. And so we built him a pricing database that tracks the price of his flowers in each port. So before he does a quote to, like, Disney Cruises in Lisbon, Portugal, he can very quickly figure out what to price him at so that he's not losing money because he was losing money because he was pricing wrong. Because he couldn't keep track of all of his pricing. We built a bunch of tools for marketing agencies like Google, My business reviews, content stuff, SEO stuff. We've done a lot of that. We built one that takes internal meetings and turns it into content. So you guys are having an internal meeting and you're like, I need to post on LinkedIn more. And you don't want to hire some expensive ghostwriter. Basically, it lets you take meeting recordings or transcripts or whatever and put it into this. Engine and it can get you basically right. LinkedIn posts and Adrian's voice that just need, like, a little bit of editing and then they can go straight on LinkedIn so you can finally start producing more LinkedIn content. And then the last one I'd say we just built. We built one for a permanent lighting installation company where every time after they finish a job, as soon as the job gets marked as one, we go on Google Maps automatically and take pictures of all the neighbors, and we use AI to add lighting to each of the neighbors, and then we send them a piece of mail saying, would you like to get permanent lights installed? We just worked on your neighbor, and it's a picture of their house with lights installed that was generated by AI that looks incredible. And it's helping them get more customers because they didn't have enough customers. And so we were building some automations around that. So those are just like from the last week.    
Them: Wow. It's. It sounds like just about anything that you can conceive.    
Me: Yeah. Y.    
Them: Can can be done.    
Me: Eah. Yeah.    
Them: So we just have to use our brain power to think of what's going to be the most. The highest roi, biggest bang for our buck activity.    
Me: What I would say, Alan? What I would say, Alonzo, is I always think, you know, I did a podcast on this, if you guys like, about Theory of Constraints. So what I would say, Alonzo, is if we get you great visibility into those compliance reports, let's pretend that they all come into a centralized database. They're searchable. You could set up alerts per manager. Do you think that that would help break you guys out to add another 50% growth? Or would you say, oh, no, it's just nice to have, but that's not really going to unlock. But if you're like, no, man, you give me good searchable granularity into these compliance reports, I can set up alerts. I can send emails. If somebody didn't fill one out, I can look for patterns and trends and compliance by location. If you're like, man, that could let us double in size because finally I'd be able to control the quality, then I want to build that one for you. Right, but if you're. You know what I'm saying? Like, what do we think is, like, the sticky part?    
Them: Yeah, I. I think you hit on something very salient. And it is because I'm a. I'm a growth CEO.    
Me: Okay?    
Them: Like I get excited. I still retain the VP of sales role in the company because I am that passionate about growth and I'm that good at it.    
Me: Cool.    
Them: And so part of me wants to say, no, no, no, let's put the agent on growth. But I know that in the past, up until now, like, we have governed our growth because of concerns about our compliance and our quality assurance. Being able to keep up with it. And sometimes we get out over our skis or we stumble, or if certain leaders aren't, you know, approaching things from a compliant minded standpoint, then we start running into challenges. And that burns up, you know, manpower and energy and. And.    
Me: Oh, yeah. It's two steps forward, two steps back, right?    
Them: Put potential, reputation and all of that. So I think that, yes, the quality assurance. Piece will because it'll create capacity. For our vice president of operations to create capacity for our managers.    
Me: Y.    
Them: It'll create capacity for our nurses, and it'll give me more confidence that the organization is ready to handle scale.    
Me: Eah, okay.    
Them: At, you know, to help handle growth at scale.    
Me: Okay? Okay, so let's jump into that one a little bit in our last, you know, whatever. So what happens here, by the way? We have this conversation and I'm going to turn this into a write up. And I'm going to email it to you guys for you guys to look if you want to add any more color to it or whatever. And then you'll say, let's freaking do it, and off we'll go. So I'm asking you questions because we're going to turn this into kind of like. It's called a prd. It's what we send to our technical folks to say, here's what we want to build those kinds of things. Adrian will work with you to get, like, accesses and stuff like that.    
Them: Yeah, and. Yeah. And keep in mind that, like, we still, I mean, we're comparing that with just basic email and calendar management as well. If it's going to be for me, I think it can be for every officer in the company.    
Me: What I would say. I think email Encounter management is a great second phase two one because there's definitely some dependencies in there, whereas this. It's from my computer. Whereas this first one I see as a I want to talk a little bit more about, because I see this one as something that can start adding. The day you deploy this, you guys are going to be happy because you can do things like start querying it for trends. Hey, are there any trends by location. Are there any trends by nurse? Are there any trends by weekend shifts versus dates? Like, there's some. Like, you're going to really enjoy some of the stuff if we start that. That would be my suggestion. I think it's a great first one. Is that okay?    
Them: Yeah, I think. Go ahead. And I just want to chime in. Yeah, I do like it. I do want to chime in, though, because it still has. It's. It's very complicated, and it does have dependencies underneath of it.    
Me: Oh, hey. Erin likes it. Hey.    
Them: So I just want to put that out there that this, because we have other systems and everything and I know, and I'm sure we'll get into the weeds of it and how to explain that to you all, but it has several dependencies.    
Me: Sure. So my question is, how are you collecting these reports right now?    
Them: So. And that's the thing. So, for example. DSPs have to the people who helps our angels that help support our individuals. They have to have certain types of compliance. Say they're four pieces of compliance. And they come from different places. They then get uploaded into our HRIS system, which is Bamboo hr, but they're documents.    
Me: Okay? Okay?    
Them: And so we would have to figure out, or I guess you guys will have to figure out, how do you comb through that to see, you know, who has what in a timely fashion? And also anything down to driver's license, I9 things of that nature, they come from different systems. And Erin, I, I mean, I think that's, that's a good compliance on the people side, I think on the, on the individual side, we're just talking about error and the day to day progress notes. And what is getting filled out and what's not. And kind of, I think about what Anthony King is doing for host homes, which the managers should be doing for the group homes, but I really have no idea because I presume Vivian is overlooking the managers. But maybe that's something we need to, you know, we need to consider. Right. Okay, but if we're talking about one system, then I agree. I think that's easier to do the therapy. Okay?    
Me: Yeah. So I would say, Erin, to your point, anything that touches, like, HR and compliance, to me is a big can of worms, which is ambitious in terms of, like, I mean, we've worked with bamboo, HR and Deal and all those, but I would call that a more ambitious thing. What I had in my mind, Alonzo, which may or may not be wrong, but essentially is like effectively the daily logbook, which is a narrative like, hey, this resident had. Had a violent incident or something, we had to call the cops. And by the way, this person quit and we need more supplies of this type of material. Do we have their i9 and their which I consider to be heavy lifting HR stuff, which is a more ambitious project is my categorization right? Or I'm just guessing here.    
Them: Yeah, yeah. You're spot on. You're spot on. 100\.    
Me: Because HR is like very meaty, very compliant. The minute you crack open an HR system, it's like looking under a rug you haven't looked at. There's a lot in there, you know what I mean? Compliance and local, city, state, municipal, hipaa, friggin, all that stuff. Whereas Alonzo giving a simple form at the end of the day for each of either your nurses or your GMs, or I don't know what your exact job titles are that says at the end of the day or at the end of the shift. We need to know this piece of information. This piece of information. This piece of information. It takes five minutes to fill out, but it lets us. Is there anything you need from us? Were there any compliance issues that we need to. And putting that all into a system that is kind of searchable, indexable, filterable for the kind of management architecture. That's in my mind. Feels like a good first bite, but I'm not sure. Is that right, Alonzo, or no?    
Them: You're right. You're right. And. And we probably need to document what's in the head of our chief administrative officer.    
Me: Okay?    
Them: As well as our vice president of operations, as it pertains to that.    
Me: Okay?    
Them: And then just really get. A playbook going that that can bubble up to become a dashboard.    
Me: Yeah. Of course.    
Them: Of key, like red, yellow, green items.    
Me: Yep.    
Them: From each day or each week or each month as it relates to what the angels. We call our employees angels.    
Me: Yep. Yep. Okay?    
Them: Put put in their daily documentation.    
Me: Yep. And the key I can tell you from building systems like this before in my own companies and others, is you want to make it as frictionless as possible for your angels to get information into the system. So I'll give you an example of something we could do if you wanted. We could easily have it be a phone number. That they call into. And they put in their personal PIN code, and then they just get to talk instead of another app or another email. And they can just call in and be like, yep, my number's 2424\. And it knows that that's Adrian. And it knows that Adrian works at this location. And then it says, awesome. Anything you want to do and they just talk normally. We can have an ask questions if you want to use actually somebody that's an AI agent that like, hey, is there anything noteworthy?    
Them: Oh, wow. Yeah. He'll be like, you know, all the residents have about movement today.    
Me: Yep.    
Them: Or did anybody not have one on your like, it could be anything like that. Were there any.    
Me: Correct. Correct. We can. We can pro. Is there anything else that you wish to. Whatever and they can do when they're driving home and they just. Everybody on your company calls the same phone number. And puts in their little number, or we can even map their phone numbers. But a pen is actually easier because people sometimes call from different numbers, which can confuse the system. And so they put in their little number. All they got to remember is their number. And then you could say, you know, go. And you have a number for nurses or angels. And you have a number for managers. And your manager numbers asks different questions than your angels numbers. Right. Is there anything. Do you need any resources? Do you have a. Whatever. And then all of that can get transcribed and put into a searchable database that every week gets emailed to their boss or to your head of ops or. That's totally the kind of thing we can do. I've done that. Yeah.    
Them: Okay?    
Me: I did it for sales. Actually, I did it for field sales personnel because field sales personnel never use CRM. They're too lazy. And so we built. We built phone numbers.    
Them: Well, that might be one. That might be. I might need a number for the the field sales to call and just.    
Me: So that they could call in. Because they never. They never do CRM because they're out driving to appointments and they're out and about. And so we just gave them a phone number to call and was like, did you close the sale? No. When's the next follow up? Are there any notes you want to know?    
Them: I love that.    
Me: Because I'm a sales guy, and so I'm so lazy. I'm like, I don't want to open up CRM, but I'll call with my little Bluetooth headset. And now I can dump my brain when I'm driving to my next appointment. That works really well too. So how about some phone based? You want to do something phone number based?    
Them: Erin, what do you think about. I mean, about them being able to call and then it feed into therap if they can dictate it versus typing it. Yeah, I feel like that would be fine. You know, one of the things is as long as we have a process for it and we have governance over it, I think it can work. It's just a change of behavior. And to know that it's going to be a paradigm shift because it's a change. In behavior for them. Yeah. But, yeah, I think it's possible. I think that's great.    
Me: So why don't.    
Them: Well, that. That can be a conversation that we. We have with Vivia, Elena, and probably even Anthony. To see if it makes sense to stay just typing in the therap or being able to call a number and dictate it.    
Me: The name of the system, just let I know.    
Them: Erip t h e r a p.    
Me: Therop. Okay. Yeah. And depending if Therop has an API or whatever, we can sniff around that. I don't want to promise anything at this point, but since you gave me the name, we'll look around. Because there's definitely ways we can ingest it. We've worked with ERPs and million. Different things.    
Them: Because into to the point that you're making, Jon, is because it needs to be in therap. So I think from a compliance standpoint, if I'm not wrong, Alonzo, with DB hdd, from a compliance standpoint, it needs to be in therapy. Is that correct?    
Me: Okay?    
Them: Right y. Billing even pulls the information out of therap in order to build.    
Me: O. Kay. Well, what I want to do is I want to take this conversation and I want to do a little bit of digging with our team to take a look at Thera and maybe put some stuff in writing for you guys and basically say, here's kind of like, what we're thinking based on this conversation. And then at that point, you guys can take a look at it and say, what about this? But the idea here is that we want to pick a very straightforward problem that drives value right away. Build a little bit of momentum.    
Them: And. And now that we're talking about it, I probably would prefer to not have to have behavioral change. But just have system updates in the background.    
Me: Okay? Okay?    
Them: For this first project. That's. That's kind of low hanging fruit. If the agents can go in and take what they're already doing.    
Me: Okay?    
Them: And make sense of it and streamline it and organize it.    
Me: How are they currently submitting your angels? Their bowel movement reports or whatever you got? What do you guys call those reports?    
Them: Daily progress notes.    
Me: Where and how are they doing their daily progress notes? Email.    
Them: In the therap system.    
Me: Oh, okay. Okay, so.    
Them: They log in, they all have their individual login. And then it's kind of like. It's like an electronic medical record, emr, that nurses or doctors put, like, notes on each patient in. It's like that.    
Me: Got it. Got it, got it, got it, got it. Got it. So what I'll do as a takeaway for this because I want to go do some research before I come back to you guys, is I want to go take a look at Therap's API. And see what we can do around that so that we don't have any changes in behavior. And then based on that, I might hit up Adrian or one of you guys for a follow up, like a quick little check in to see if we like what we're building. But let me go do some digging before. I kind of, like, promise the shape of this, but I've got a decent sense of a couple of your problems that we can definitely sink our teeth into pretty quickly. It's not going to cost any money to build because you guys have credits, so should be pretty easy to get started. Is that a good kind of plan of action?    
Them: Yeah, that sounds good.    
Me: Fantastic. Well, it's great to meet everybody. I will take next action. I have an email that I need to send you guys, and then we'll just plan on going from there. Does that sound good?    
Them: Yeah, that sounds great.    
Me: Great to meet you guys. Thank you for contributing. Appreciate it. Thanks, guys.    
Them: All right. Okay. Thanks, jon. Thank you, jon. Take care.    
Me: Thanks, guys. Bye.